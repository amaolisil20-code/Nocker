from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = 'HS256'
JWT_EXP_HOURS = 24 * 30

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="Nocker API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ---------- MODELS ----------
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    created_at: datetime

class AuthResponse(BaseModel):
    token: str
    user: UserOut

class TransactionCreate(BaseModel):
    type: Literal['income', 'expense']
    amount: float
    category: str
    description: str
    date: Optional[datetime] = None
    card_id: Optional[str] = None

class TransactionOut(BaseModel):
    id: str
    user_id: str
    type: str
    amount: float
    category: str
    description: str
    date: datetime
    card_id: Optional[str] = None
    created_at: datetime

class CardCreate(BaseModel):
    name: str
    last_digits: str
    brand: str  # visa, mastercard, elo, amex
    limit: float
    closing_day: int
    due_day: int
    color: Optional[str] = "#16A34A"

class CardOut(BaseModel):
    id: str
    user_id: str
    name: str
    last_digits: str
    brand: str
    limit: float
    closing_day: int
    due_day: int
    color: str
    used: float = 0
    created_at: datetime

class GoalCreate(BaseModel):
    title: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[datetime] = None
    icon: Optional[str] = "trophy"
    color: Optional[str] = "#16A34A"

class GoalOut(BaseModel):
    id: str
    user_id: str
    title: str
    target_amount: float
    current_amount: float
    deadline: Optional[datetime] = None
    icon: str
    color: str
    created_at: datetime

class GoalUpdate(BaseModel):
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    title: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    session_id: str
    reply: str

class FixedExpenseCreate(BaseModel):
    name: str
    amount: float
    category: str
    due_day: int
    color: Optional[str] = "#16A34A"
    notes: Optional[str] = None
    active: bool = True

class FixedExpenseOut(BaseModel):
    id: str
    user_id: str
    name: str
    amount: float
    category: str
    due_day: int
    color: str
    notes: Optional[str] = None
    active: bool
    created_at: datetime

class InstallmentCreate(BaseModel):
    name: str
    total_amount: float
    installments_total: int
    installments_paid: int = 0
    start_date: Optional[datetime] = None
    category: str
    color: Optional[str] = "#3B82F6"
    card_id: Optional[str] = None

class InstallmentOut(BaseModel):
    id: str
    user_id: str
    name: str
    total_amount: float
    installments_total: int
    installments_paid: int
    monthly_amount: float
    remaining_amount: float
    start_date: Optional[datetime] = None
    category: str
    color: str
    card_id: Optional[str] = None
    created_at: datetime

class SubscriptionCreate(BaseModel):
    name: str
    amount: float
    billing_cycle: Literal['monthly', 'yearly'] = 'monthly'
    next_billing_date: Optional[datetime] = None
    color: Optional[str] = "#8B5CF6"
    icon: Optional[str] = "repeat"
    active: bool = True

class SubscriptionOut(BaseModel):
    id: str
    user_id: str
    name: str
    amount: float
    billing_cycle: str
    next_billing_date: Optional[datetime] = None
    color: str
    icon: str
    active: bool
    monthly_cost: float
    created_at: datetime

class CategoryCreate(BaseModel):
    name: str
    type: Literal['income', 'expense'] = 'expense'
    color: Optional[str] = "#16A34A"
    icon: Optional[str] = "pricetag"

class CategoryOut(BaseModel):
    id: str
    user_id: str
    name: str
    type: str
    color: str
    icon: str
    created_at: datetime

# ---------- HELPERS ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get('sub')
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def user_to_out(user: dict) -> UserOut:
    return UserOut(
        id=user['id'],
        name=user['name'],
        email=user['email'],
        created_at=user['created_at'],
    )

# ---------- AUTH ----------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: UserRegister):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id)
    return AuthResponse(token=token, user=user_to_out(doc))

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user['password']):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    token = create_token(user['id'])
    return AuthResponse(token=token, user=user_to_out(user))

@api_router.get("/auth/me", response_model=UserOut)
async def me(current=Depends(get_current_user)):
    return user_to_out(current)

# ---------- TRANSACTIONS ----------
@api_router.post("/transactions", response_model=TransactionOut)
async def create_transaction(payload: TransactionCreate, current=Depends(get_current_user)):
    tx_id = str(uuid.uuid4())
    doc = {
        "id": tx_id,
        "user_id": current['id'],
        "type": payload.type,
        "amount": float(payload.amount),
        "category": payload.category,
        "description": payload.description,
        "date": payload.date or datetime.now(timezone.utc),
        "card_id": payload.card_id,
        "created_at": datetime.now(timezone.utc),
    }
    await db.transactions.insert_one(doc.copy())
    return TransactionOut(**doc)

@api_router.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(current=Depends(get_current_user), limit: int = 200):
    items = await db.transactions.find({"user_id": current['id']}, {"_id": 0}).sort("date", -1).to_list(limit)
    return [TransactionOut(**i) for i in items]

@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, current=Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return {"ok": True}

# ---------- CARDS ----------
@api_router.post("/cards", response_model=CardOut)
async def create_card(payload: CardCreate, current=Depends(get_current_user)):
    card_id = str(uuid.uuid4())
    doc = {
        "id": card_id,
        "user_id": current['id'],
        "name": payload.name,
        "last_digits": payload.last_digits[-4:],
        "brand": payload.brand,
        "limit": float(payload.limit),
        "closing_day": payload.closing_day,
        "due_day": payload.due_day,
        "color": payload.color or "#16A34A",
        "used": 0.0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.cards.insert_one(doc.copy())
    return CardOut(**doc)

@api_router.get("/cards", response_model=List[CardOut])
async def list_cards(current=Depends(get_current_user)):
    items = await db.cards.find({"user_id": current['id']}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # compute used from card transactions
    for it in items:
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": current['id'], "card_id": it['id'], "type": "expense"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        it['used'] = float(agg[0]['total']) if agg else 0.0
    return [CardOut(**i) for i in items]

@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, current=Depends(get_current_user)):
    res = await db.cards.delete_one({"id": card_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cartão não encontrado")
    return {"ok": True}

# ---------- GOALS ----------
@api_router.post("/goals", response_model=GoalOut)
async def create_goal(payload: GoalCreate, current=Depends(get_current_user)):
    goal_id = str(uuid.uuid4())
    doc = {
        "id": goal_id,
        "user_id": current['id'],
        "title": payload.title,
        "target_amount": float(payload.target_amount),
        "current_amount": float(payload.current_amount),
        "deadline": payload.deadline,
        "icon": payload.icon or "trophy",
        "color": payload.color or "#16A34A",
        "created_at": datetime.now(timezone.utc),
    }
    await db.goals.insert_one(doc.copy())
    return GoalOut(**doc)

@api_router.get("/goals", response_model=List[GoalOut])
async def list_goals(current=Depends(get_current_user)):
    items = await db.goals.find({"user_id": current['id']}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [GoalOut(**i) for i in items]

@api_router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, payload: GoalUpdate, current=Depends(get_current_user)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.goals.find_one_and_update(
        {"id": goal_id, "user_id": current['id']},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return GoalOut(**res)

@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, current=Depends(get_current_user)):
    res = await db.goals.delete_one({"id": goal_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return {"ok": True}

# ---------- DASHBOARD ----------
@api_router.get("/dashboard/summary")
async def dashboard_summary(current=Depends(get_current_user)):
    user_id = current['id']
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # totals all-time
    pipe_total = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]
    totals = {"income": 0.0, "expense": 0.0}
    async for row in db.transactions.aggregate(pipe_total):
        totals[row['_id']] = float(row['total'])
    balance = totals['income'] - totals['expense']

    # month
    pipe_month = [
        {"$match": {"user_id": user_id, "date": {"$gte": month_start}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]
    month = {"income": 0.0, "expense": 0.0}
    async for row in db.transactions.aggregate(pipe_month):
        month[row['_id']] = float(row['total'])
    savings = month['income'] - month['expense']

    # category breakdown (expenses month)
    pipe_cat = [
        {"$match": {"user_id": user_id, "type": "expense", "date": {"$gte": month_start}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
    ]
    categories = []
    async for row in db.transactions.aggregate(pipe_cat):
        categories.append({"category": row['_id'], "total": float(row['total'])})

    # last 6 months evolution
    evolution = []
    for i in range(5, -1, -1):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        if m == 12:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
        pipe = [
            {"$match": {"user_id": user_id, "date": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
        ]
        inc = exp = 0.0
        async for row in db.transactions.aggregate(pipe):
            if row['_id'] == 'income':
                inc = float(row['total'])
            else:
                exp = float(row['total'])
        evolution.append({"month": start.strftime("%b"), "income": inc, "expense": exp})

    # recent transactions
    recent = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(5)

    # cards count
    cards_count = await db.cards.count_documents({"user_id": user_id})
    goals_count = await db.goals.count_documents({"user_id": user_id})

    return {
        "balance": balance,
        "total_income": totals['income'],
        "total_expense": totals['expense'],
        "month_income": month['income'],
        "month_expense": month['expense'],
        "month_savings": savings,
        "categories": categories,
        "evolution": evolution,
        "recent": recent,
        "cards_count": cards_count,
        "goals_count": goals_count,
    }

# ---------- FIXED EXPENSES ----------
@api_router.post("/fixed-expenses", response_model=FixedExpenseOut)
async def create_fixed_expense(payload: FixedExpenseCreate, current=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current['id'],
        "name": payload.name.strip(),
        "amount": float(payload.amount),
        "category": payload.category,
        "due_day": int(payload.due_day),
        "color": payload.color or "#16A34A",
        "notes": payload.notes,
        "active": payload.active,
        "created_at": datetime.now(timezone.utc),
    }
    await db.fixed_expenses.insert_one(doc.copy())
    return FixedExpenseOut(**doc)

@api_router.get("/fixed-expenses", response_model=List[FixedExpenseOut])
async def list_fixed_expenses(current=Depends(get_current_user)):
    items = await db.fixed_expenses.find({"user_id": current['id']}, {"_id": 0}).sort("due_day", 1).to_list(200)
    return [FixedExpenseOut(**i) for i in items]

@api_router.patch("/fixed-expenses/{fe_id}", response_model=FixedExpenseOut)
async def update_fixed_expense(fe_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "amount", "category", "due_day", "color", "notes", "active"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.fixed_expenses.find_one_and_update(
        {"id": fe_id, "user_id": current['id']}, {"$set": update},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Gasto fixo não encontrado")
    return FixedExpenseOut(**res)

@api_router.delete("/fixed-expenses/{fe_id}")
async def delete_fixed_expense(fe_id: str, current=Depends(get_current_user)):
    res = await db.fixed_expenses.delete_one({"id": fe_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gasto fixo não encontrado")
    return {"ok": True}

# ---------- INSTALLMENTS ----------
def _installment_compute(doc: dict) -> dict:
    monthly = float(doc['total_amount']) / max(doc['installments_total'], 1)
    remaining_count = max(0, doc['installments_total'] - doc['installments_paid'])
    return {
        **doc,
        "monthly_amount": round(monthly, 2),
        "remaining_amount": round(monthly * remaining_count, 2),
    }

@api_router.post("/installments", response_model=InstallmentOut)
async def create_installment(payload: InstallmentCreate, current=Depends(get_current_user)):
    if payload.installments_total <= 0:
        raise HTTPException(status_code=400, detail="Parcelas inválidas")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current['id'],
        "name": payload.name.strip(),
        "total_amount": float(payload.total_amount),
        "installments_total": int(payload.installments_total),
        "installments_paid": int(payload.installments_paid),
        "start_date": payload.start_date or datetime.now(timezone.utc),
        "category": payload.category,
        "color": payload.color or "#3B82F6",
        "card_id": payload.card_id,
        "created_at": datetime.now(timezone.utc),
    }
    await db.installments.insert_one(doc.copy())
    return InstallmentOut(**_installment_compute(doc))

@api_router.get("/installments", response_model=List[InstallmentOut])
async def list_installments(current=Depends(get_current_user)):
    items = await db.installments.find({"user_id": current['id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [InstallmentOut(**_installment_compute(i)) for i in items]

@api_router.patch("/installments/{i_id}", response_model=InstallmentOut)
async def update_installment(i_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "total_amount", "installments_total", "installments_paid", "category", "color", "card_id"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.installments.find_one_and_update(
        {"id": i_id, "user_id": current['id']}, {"$set": update},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    return InstallmentOut(**_installment_compute(res))

@api_router.delete("/installments/{i_id}")
async def delete_installment(i_id: str, current=Depends(get_current_user)):
    res = await db.installments.delete_one({"id": i_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    return {"ok": True}

# ---------- SUBSCRIPTIONS ----------
def _subscription_compute(doc: dict) -> dict:
    amt = float(doc['amount'])
    monthly = amt if doc['billing_cycle'] == 'monthly' else amt / 12.0
    return {**doc, "monthly_cost": round(monthly, 2)}

@api_router.post("/subscriptions", response_model=SubscriptionOut)
async def create_subscription(payload: SubscriptionCreate, current=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current['id'],
        "name": payload.name.strip(),
        "amount": float(payload.amount),
        "billing_cycle": payload.billing_cycle,
        "next_billing_date": payload.next_billing_date,
        "color": payload.color or "#8B5CF6",
        "icon": payload.icon or "repeat",
        "active": payload.active,
        "created_at": datetime.now(timezone.utc),
    }
    await db.subscriptions.insert_one(doc.copy())
    return SubscriptionOut(**_subscription_compute(doc))

@api_router.get("/subscriptions", response_model=List[SubscriptionOut])
async def list_subscriptions(current=Depends(get_current_user)):
    items = await db.subscriptions.find({"user_id": current['id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [SubscriptionOut(**_subscription_compute(i)) for i in items]

@api_router.patch("/subscriptions/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(sub_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "amount", "billing_cycle", "next_billing_date", "color", "icon", "active"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.subscriptions.find_one_and_update(
        {"id": sub_id, "user_id": current['id']}, {"$set": update},
        return_document=True, projection={"_id": 0},
    )
    if not res:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    return SubscriptionOut(**_subscription_compute(res))

@api_router.delete("/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, current=Depends(get_current_user)):
    res = await db.subscriptions.delete_one({"id": sub_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    return {"ok": True}

# ---------- CATEGORIES ----------
DEFAULT_CATEGORIES = [
    {"name": "Alimentação", "type": "expense", "color": "#F59E0B", "icon": "fast-food"},
    {"name": "Transporte", "type": "expense", "color": "#3B82F6", "icon": "car"},
    {"name": "Moradia", "type": "expense", "color": "#8B5CF6", "icon": "home"},
    {"name": "Lazer", "type": "expense", "color": "#EC4899", "icon": "game-controller"},
    {"name": "Saúde", "type": "expense", "color": "#EF4444", "icon": "medkit"},
    {"name": "Educação", "type": "expense", "color": "#06B6D4", "icon": "school"},
    {"name": "Compras", "type": "expense", "color": "#F97316", "icon": "bag"},
    {"name": "Outros", "type": "expense", "color": "#737373", "icon": "ellipsis-horizontal"},
    {"name": "Salário", "type": "income", "color": "#16A34A", "icon": "cash"},
    {"name": "Investimentos", "type": "income", "color": "#10B981", "icon": "trending-up"},
]

@api_router.post("/categories", response_model=CategoryOut)
async def create_category(payload: CategoryCreate, current=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current['id'],
        "name": payload.name.strip(),
        "type": payload.type,
        "color": payload.color or "#16A34A",
        "icon": payload.icon or "pricetag",
        "created_at": datetime.now(timezone.utc),
    }
    await db.categories.insert_one(doc.copy())
    return CategoryOut(**doc)

@api_router.get("/categories", response_model=List[CategoryOut])
async def list_categories(current=Depends(get_current_user)):
    items = await db.categories.find({"user_id": current['id']}, {"_id": 0}).sort("created_at", 1).to_list(200)
    if not items:
        # seed defaults for new user
        now = datetime.now(timezone.utc)
        seeds = [
            {**c, "id": str(uuid.uuid4()), "user_id": current['id'], "created_at": now}
            for c in DEFAULT_CATEGORIES
        ]
        await db.categories.insert_many([s.copy() for s in seeds])
        items = seeds
    return [CategoryOut(**i) for i in items]

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, current=Depends(get_current_user)):
    res = await db.categories.delete_one({"id": cat_id, "user_id": current['id']})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return {"ok": True}

# ---------- PROJECTION ----------
@api_router.get("/projection")
async def projection(months: int = 6, current=Depends(get_current_user)):
    if months < 1 or months > 24:
        months = 6
    user_id = current['id']
    now = datetime.now(timezone.utc)

    # Current balance
    pipe_total = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
    ]
    totals = {"income": 0.0, "expense": 0.0}
    async for row in db.transactions.aggregate(pipe_total):
        totals[row['_id']] = float(row['total'])
    balance = totals['income'] - totals['expense']

    # Average monthly savings over last 3 months
    last3_inc = 0.0
    last3_exp = 0.0
    months_counted = 0
    for i in range(3):
        y = now.year; m = now.month - i
        while m <= 0: m += 12; y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1, tzinfo=timezone.utc)
        pipe = [
            {"$match": {"user_id": user_id, "date": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}
        ]
        async for row in db.transactions.aggregate(pipe):
            if row['_id'] == 'income': last3_inc += float(row['total'])
            else: last3_exp += float(row['total'])
        months_counted += 1
    avg_inc = last3_inc / max(months_counted, 1)
    avg_exp = last3_exp / max(months_counted, 1)

    # Add committed fixed expenses (monthly) + subscriptions (monthly)
    fixed_total = 0.0
    async for fe in db.fixed_expenses.find({"user_id": user_id, "active": True}, {"_id": 0, "amount": 1}):
        fixed_total += float(fe['amount'])

    sub_total = 0.0
    async for sub in db.subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0, "amount": 1, "billing_cycle": 1}):
        amt = float(sub['amount'])
        sub_total += amt if sub['billing_cycle'] == 'monthly' else amt / 12.0

    # Installments remaining per month (only those still active)
    inst_monthly = 0.0
    async for inst in db.installments.find({"user_id": user_id}, {"_id": 0}):
        if inst['installments_paid'] < inst['installments_total']:
            inst_monthly += float(inst['total_amount']) / max(inst['installments_total'], 1)

    monthly_expense_projected = max(avg_exp, fixed_total + sub_total + inst_monthly)
    monthly_net = avg_inc - monthly_expense_projected

    projection_data = []
    proj_balance = balance
    for i in range(1, months + 1):
        proj_balance += monthly_net
        target_month = now.month + i
        year_offset = (target_month - 1) // 12
        target_month = ((target_month - 1) % 12) + 1
        label_date = datetime(now.year + year_offset, target_month, 1)
        projection_data.append({
            "month": label_date.strftime("%b/%y"),
            "projected_balance": round(proj_balance, 2),
            "monthly_net": round(monthly_net, 2),
        })

    return {
        "current_balance": round(balance, 2),
        "avg_monthly_income": round(avg_inc, 2),
        "avg_monthly_expense": round(monthly_expense_projected, 2),
        "monthly_net": round(monthly_net, 2),
        "fixed_total": round(fixed_total, 2),
        "subscriptions_monthly": round(sub_total, 2),
        "installments_monthly": round(inst_monthly, 2),
        "projection": projection_data,
    }

# ---------- CHAT (Nocker AI) ----------
@api_router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, current=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key não configurada")

    session_id = payload.session_id or str(uuid.uuid4())

    # build financial context for the user
    summary = await dashboard_summary(current)
    context_lines = [
        f"Saldo atual: R$ {summary['balance']:.2f}",
        f"Receitas do mês: R$ {summary['month_income']:.2f}",
        f"Despesas do mês: R$ {summary['month_expense']:.2f}",
        f"Economia do mês: R$ {summary['month_savings']:.2f}",
    ]
    if summary['categories']:
        top = summary['categories'][:5]
        context_lines.append("Top categorias do mês:")
        for c in top:
            context_lines.append(f"  - {c['category']}: R$ {c['total']:.2f}")

    system_message = (
        "Você é a Nocker IA, assistente financeira pessoal premium do app Nocker. "
        "Seu papel é ajudar o usuário a entender seus gastos, sugerir economia, "
        "criar metas e dar insights inteligentes. Responda sempre em português brasileiro, "
        "de forma amigável, moderna e direta. Use no máximo 4 parágrafos curtos. "
        "Use emojis com moderação. Seja sempre encorajador e prático.\n\n"
        f"Contexto financeiro do usuário ({current['name']}):\n" + "\n".join(context_lines)
    )

    # load history from db (last 20 messages)
    history = await db.chat_messages.find(
        {"user_id": current['id'], "session_id": session_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(20)

    try:
        chat_inst = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_message,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        # Replay context (emergentintegrations manages history per session_id internally)
        # We already pass system + new message; for stateless calls add prior context as preamble
        prior = ""
        if history:
            prior = "Histórico recente:\n"
            for h in history[-6:]:
                role = "Usuário" if h['role'] == 'user' else "Nocker IA"
                prior += f"{role}: {h['content']}\n"
            prior += "\nNova mensagem do usuário: "

        user_msg = UserMessage(text=prior + payload.message)
        reply = await chat_inst.send_message(user_msg)
    except Exception as e:
        logging.exception("Chat error")
        raise HTTPException(status_code=500, detail=f"Erro IA: {str(e)}")

    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": current['id'], "session_id": session_id,
         "role": "user", "content": payload.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": current['id'], "session_id": session_id,
         "role": "assistant", "content": reply, "created_at": now},
    ])
    return ChatResponse(session_id=session_id, reply=reply)

@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str, current=Depends(get_current_user)):
    items = await db.chat_messages.find(
        {"user_id": current['id'], "session_id": session_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return items

@api_router.get("/chat/sessions")
async def chat_sessions(current=Depends(get_current_user)):
    sessions = await db.chat_messages.aggregate([
        {"$match": {"user_id": current['id']}},
        {"$group": {"_id": "$session_id", "last": {"$max": "$created_at"}}},
        {"$sort": {"last": -1}},
        {"$limit": 20},
    ]).to_list(20)
    return [{"session_id": s['_id'], "last": s['last']} for s in sessions]

# ---------- HEALTH ----------
@api_router.get("/")
async def root():
    return {"app": "Nocker", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
