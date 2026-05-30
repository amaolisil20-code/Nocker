from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

import anthropic
from supabase import create_client, Client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Supabase connection
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
    username: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime

class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    avatar_url: Optional[str] = None

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
    card_limit: float
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

# ---------- FINANCIAL SETTINGS MODELS ----------

class FinancialSettingsUpdate(BaseModel):
    monthly_income: Optional[float] = None
    monthly_limit: Optional[float] = None

class FinancialSettingsOut(BaseModel):
    monthly_income: float
    monthly_limit: float

class CategoryLimitCreate(BaseModel):
    category_name: str
    monthly_limit: float
    color: Optional[str] = "#16A34A"

class CategoryLimitOut(BaseModel):
    id: str
    category_name: str
    monthly_limit: float
    color: str

class SpendingAlertUpdate(BaseModel):
    type: Literal['monthly_limit', 'category_limit', 'income_goal']
    threshold_pct: int  # 1-100
    active: bool

class SpendingAlertOut(BaseModel):
    id: str
    type: str
    threshold_pct: int
    active: bool

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
    
    response = supabase.table('users').select('*').eq('id', user_id).execute()
    user = response.data[0] if response.data else None
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def user_to_out(user: dict) -> UserOut:
    return UserOut(
        id=user['id'],
        name=user['name'],
        email=user['email'],
        username=user.get('username'),
        phone=user.get('phone'),
        birth_date=user.get('birth_date'),
        avatar_url=user.get('avatar_url'),
        created_at=user['created_at'],
    )

# ---------- HEALTH ----------
@api_router.get("/")
async def health():
    return {"status": "ok"}

# ---------- AUTH ----------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: UserRegister):
    existing = supabase.table('users').select('id').eq('email', payload.email.lower()).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('users').insert(doc).execute()
    token = create_token(user_id)
    return AuthResponse(token=token, user=user_to_out(doc))

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    response = supabase.table('users').select('*').eq('email', payload.email.lower()).execute()
    user = response.data[0] if response.data else None
    if not user or not verify_password(payload.password, user['password']):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    token = create_token(user['id'])
    return AuthResponse(token=token, user=user_to_out(user))

@api_router.get("/auth/me", response_model=UserOut)
async def me(current=Depends(get_current_user)):
    return user_to_out(current)

@api_router.patch("/auth/profile", response_model=UserOut)
async def update_profile(payload: UserUpdate, current=Depends(get_current_user)):
    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    response = supabase.table('users').update(update_data).eq('id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user_to_out(response.data[0])

@api_router.post("/auth/avatar", response_model=UserOut)
async def update_avatar(avatar_url: str, current=Depends(get_current_user)):
    response = supabase.table('users').update({
        'avatar_url': avatar_url,
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user_to_out(response.data[0])

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
        "date": (payload.date or datetime.now(timezone.utc)).isoformat(),
        "card_id": payload.card_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('transactions').insert(doc).execute()
    return TransactionOut(**doc)

@api_router.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(current=Depends(get_current_user), limit: int = 200):
    response = supabase.table('transactions').select('*').eq('user_id', current['id']).order('date', desc=True).limit(limit).execute()
    return [TransactionOut(**i) for i in response.data]

@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, current=Depends(get_current_user)):
    response = supabase.table('transactions').delete().eq('id', tx_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return {"ok": True}

@api_router.patch("/transactions/{tx_id}", response_model=TransactionOut)
async def update_transaction(tx_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {'type', 'amount', 'category', 'description', 'date', 'card_id'}
    update_data = {k: v for k, v in payload.items() if k in allowed}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    if 'amount' in update_data:
        update_data['amount'] = float(update_data['amount'])
    response = supabase.table('transactions').update(update_data).eq('id', tx_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return TransactionOut(**response.data[0])

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
        "card_limit": float(payload.limit),
        "closing_day": payload.closing_day,
        "due_day": payload.due_day,
        "color": payload.color or "#16A34A",
        "used": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('cards').insert(doc).execute()
    return CardOut(**doc)

@api_router.get("/cards", response_model=List[CardOut])
async def list_cards(current=Depends(get_current_user)):
    response = supabase.table('cards').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(100).execute()
    items = response.data
    
    # compute used from card transactions
    for it in items:
        tx_response = supabase.table('transactions').select('amount').eq('user_id', current['id']).eq('card_id', it['id']).eq('type', 'expense').execute()
        it['used'] = sum(float(tx['amount']) for tx in tx_response.data) if tx_response.data else 0.0
    
    return [CardOut(**i) for i in items]

@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, current=Depends(get_current_user)):
    response = supabase.table('cards').delete().eq('id', card_id).eq('user_id', current['id']).execute()
    if not response.data:
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
        "deadline": payload.deadline.isoformat() if payload.deadline else None,
        "icon": payload.icon or "trophy",
        "color": payload.color or "#16A34A",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('goals').insert(doc).execute()
    return GoalOut(**doc)

@api_router.get("/goals", response_model=List[GoalOut])
async def list_goals(current=Depends(get_current_user)):
    response = supabase.table('goals').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(100).execute()
    return [GoalOut(**i) for i in response.data]

@api_router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, payload: GoalUpdate, current=Depends(get_current_user)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    response = supabase.table('goals').update(update).eq('id', goal_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return GoalOut(**response.data[0])

@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, current=Depends(get_current_user)):
    response = supabase.table('goals').delete().eq('id', goal_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return {"ok": True}

# ---------- FIXED EXPENSES ----------
@api_router.post("/fixed-expenses", response_model=FixedExpenseOut)
async def create_fixed_expense(payload: FixedExpenseCreate, current=Depends(get_current_user)):
    fe_id = str(uuid.uuid4())
    doc = {
        "id": fe_id,
        "user_id": current['id'],
        "name": payload.name.strip(),
        "amount": float(payload.amount),
        "category": payload.category,
        "due_day": payload.due_day,
        "color": payload.color or "#16A34A",
        "notes": payload.notes,
        "active": payload.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('fixed_expenses').insert(doc).execute()
    return FixedExpenseOut(**doc)

@api_router.get("/fixed-expenses", response_model=List[FixedExpenseOut])
async def list_fixed_expenses(current=Depends(get_current_user)):
    response = supabase.table('fixed_expenses').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(200).execute()
    return [FixedExpenseOut(**i) for i in response.data]

@api_router.patch("/fixed-expenses/{fe_id}", response_model=FixedExpenseOut)
async def update_fixed_expense(fe_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "amount", "category", "due_day", "color", "notes", "active"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    response = supabase.table('fixed_expenses').update(update).eq('id', fe_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Gasto fixo não encontrado")
    return FixedExpenseOut(**response.data[0])

@api_router.delete("/fixed-expenses/{fe_id}")
async def delete_fixed_expense(fe_id: str, current=Depends(get_current_user)):
    response = supabase.table('fixed_expenses').delete().eq('id', fe_id).eq('user_id', current['id']).execute()
    if not response.data:
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
        "start_date": (payload.start_date or datetime.now(timezone.utc)).isoformat(),
        "category": payload.category,
        "color": payload.color or "#3B82F6",
        "card_id": payload.card_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('installments').insert(doc).execute()
    return InstallmentOut(**_installment_compute(doc))

@api_router.get("/installments", response_model=List[InstallmentOut])
async def list_installments(current=Depends(get_current_user)):
    response = supabase.table('installments').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(200).execute()
    return [InstallmentOut(**_installment_compute(i)) for i in response.data]

@api_router.patch("/installments/{i_id}", response_model=InstallmentOut)
async def update_installment(i_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "total_amount", "installments_total", "installments_paid", "category", "color", "card_id"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    response = supabase.table('installments').update(update).eq('id', i_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    return InstallmentOut(**_installment_compute(response.data[0]))

@api_router.delete("/installments/{i_id}")
async def delete_installment(i_id: str, current=Depends(get_current_user)):
    response = supabase.table('installments').delete().eq('id', i_id).eq('user_id', current['id']).execute()
    if not response.data:
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
        "next_billing_date": payload.next_billing_date.isoformat() if payload.next_billing_date else None,
        "color": payload.color or "#8B5CF6",
        "icon": payload.icon or "repeat",
        "active": payload.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('subscriptions').insert(doc).execute()
    return SubscriptionOut(**_subscription_compute(doc))

@api_router.get("/subscriptions", response_model=List[SubscriptionOut])
async def list_subscriptions(current=Depends(get_current_user)):
    response = supabase.table('subscriptions').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(200).execute()
    return [SubscriptionOut(**_subscription_compute(i)) for i in response.data]

@api_router.patch("/subscriptions/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(sub_id: str, payload: dict, current=Depends(get_current_user)):
    allowed = {"name", "amount", "billing_cycle", "next_billing_date", "color", "icon", "active"}
    update = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    response = supabase.table('subscriptions').update(update).eq('id', sub_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    return SubscriptionOut(**_subscription_compute(response.data[0]))

@api_router.delete("/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, current=Depends(get_current_user)):
    response = supabase.table('subscriptions').delete().eq('id', sub_id).eq('user_id', current['id']).execute()
    if not response.data:
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('categories').insert(doc).execute()
    return CategoryOut(**doc)

@api_router.get("/categories", response_model=List[CategoryOut])
async def list_categories(current=Depends(get_current_user)):
    response = supabase.table('categories').select('*').eq('user_id', current['id']).order('created_at', asc=True).limit(200).execute()
    items = response.data
    if not items:
        # seed defaults for new user
        now = datetime.now(timezone.utc).isoformat()
        seeds = [
            {**c, "id": str(uuid.uuid4()), "user_id": current['id'], "created_at": now}
            for c in DEFAULT_CATEGORIES
        ]
        supabase.table('categories').insert(seeds).execute()
        items = seeds
    return [CategoryOut(**i) for i in items]

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, current=Depends(get_current_user)):
    response = supabase.table('categories').delete().eq('id', cat_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return {"ok": True}

# ---------- DASHBOARD ----------
@api_router.get("/dashboard/summary")
async def dashboard_summary(current=Depends(get_current_user)):
    user_id = current['id']
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # totals all-time
    tx_response = supabase.table('transactions').select('type, amount').eq('user_id', user_id).execute()
    totals = {"income": 0.0, "expense": 0.0}
    for tx in tx_response.data:
        totals[tx['type']] = totals.get(tx['type'], 0.0) + float(tx['amount'])
    balance = totals['income'] - totals['expense']

    # month
    month_tx_response = supabase.table('transactions').select('type, amount').eq('user_id', user_id).gte('date', month_start.isoformat()).execute()
    month = {"income": 0.0, "expense": 0.0}
    for tx in month_tx_response.data:
        month[tx['type']] = month.get(tx['type'], 0.0) + float(tx['amount'])
    savings = month['income'] - month['expense']

    # category breakdown (expenses month)
    cat_tx_response = supabase.table('transactions').select('category, amount').eq('user_id', user_id).eq('type', 'expense').gte('date', month_start.isoformat()).execute()
    categories = {}
    for tx in cat_tx_response.data:
        cat = tx['category']
        categories[cat] = categories.get(cat, 0.0) + float(tx['amount'])
    categories_list = [{"category": k, "total": v} for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)]

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
        
        evo_response = supabase.table('transactions').select('type, amount').eq('user_id', user_id).gte('date', start.isoformat()).lt('date', end.isoformat()).execute()
        inc = exp = 0.0
        for tx in evo_response.data:
            if tx['type'] == 'income':
                inc += float(tx['amount'])
            else:
                exp += float(tx['amount'])
        evolution.append({"month": start.strftime("%b/%y"), "income": round(inc, 2), "expense": round(exp, 2)})

    # recent transactions (last 5)
    recent_response = supabase.table('transactions').select('*').eq('user_id', user_id).order('date', desc=True).limit(5).execute()
    recent = [
        {
            "id": tx['id'],
            "type": tx['type'],
            "description": tx['description'],
            "category": tx['category'],
            "amount": float(tx['amount']),
        }
        for tx in recent_response.data
    ]

    # counts
    cards_response = supabase.table('cards').select('id', count='exact').eq('user_id', user_id).execute()
    cards_count = len(cards_response.data) if cards_response.data else 0
    
    goals_response = supabase.table('goals').select('id', count='exact').eq('user_id', user_id).execute()
    goals_count = len(goals_response.data) if goals_response.data else 0

    return {
        "balance": round(balance, 2),
        "total_income": round(totals['income'], 2),
        "total_expense": round(totals['expense'], 2),
        "month_income": round(month['income'], 2),
        "month_expense": round(month['expense'], 2),
        "month_savings": round(savings, 2),
        "categories": categories_list,
        "evolution": evolution,
        "recent": recent,
        "cards_count": cards_count,
        "goals_count": goals_count,
    }

# ---------- PROJECTION ----------
@api_router.get("/projection")
async def projection(months: int = 6, current=Depends(get_current_user)):
    if months < 1 or months > 24:
        months = 6
    user_id = current['id']
    now = datetime.now(timezone.utc)

    # Current balance
    tx_response = supabase.table('transactions').select('type, amount').eq('user_id', user_id).execute()
    totals = {"income": 0.0, "expense": 0.0}
    for tx in tx_response.data:
        totals[tx['type']] = totals.get(tx['type'], 0.0) + float(tx['amount'])
    balance = totals['income'] - totals['expense']

    # Average monthly savings over last 3 months
    last3_inc = 0.0
    last3_exp = 0.0
    months_counted = 0
    for i in range(3):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1, tzinfo=timezone.utc)
        
        month_response = supabase.table('transactions').select('type, amount').eq('user_id', user_id).gte('date', start.isoformat()).lt('date', end.isoformat()).execute()
        for tx in month_response.data:
            if tx['type'] == 'income':
                last3_inc += float(tx['amount'])
            else:
                last3_exp += float(tx['amount'])
        months_counted += 1
    
    avg_inc = last3_inc / max(months_counted, 1)
    avg_exp = last3_exp / max(months_counted, 1)

    # Add committed fixed expenses (monthly) + subscriptions (monthly)
    fixed_response = supabase.table('fixed_expenses').select('amount').eq('user_id', user_id).eq('active', True).execute()
    fixed_total = sum(float(fe['amount']) for fe in fixed_response.data) if fixed_response.data else 0.0

    sub_response = supabase.table('subscriptions').select('amount, billing_cycle').eq('user_id', user_id).eq('active', True).execute()
    sub_total = 0.0
    for sub in sub_response.data:
        amt = float(sub['amount'])
        sub_total += amt if sub['billing_cycle'] == 'monthly' else amt / 12.0

    # Installments remaining per month (only those still active)
    inst_response = supabase.table('installments').select('total_amount, installments_total, installments_paid').eq('user_id', user_id).execute()
    inst_monthly = 0.0
    for inst in inst_response.data:
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
    history_response = supabase.table('chat_messages').select('*').eq('user_id', current['id']).eq('session_id', session_id).order('created_at', asc=True).limit(20).execute()
    history = history_response.data if history_response.data else []

    try:
        client = anthropic.Anthropic(api_key=EMERGENT_LLM_KEY)

        messages = []
        if history:
            for h in history[-6:]:
                messages.append({"role": h['role'], "content": h['content']})
        messages.append({"role": "user", "content": payload.message})

        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            system=system_message,
            messages=messages,
        )
        reply = response.content[0].text
    except Exception as e:
        logging.exception("Chat error")
        raise HTTPException(status_code=500, detail=f"Erro IA: {str(e)}")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table('chat_messages').insert([
        {"id": str(uuid.uuid4()), "user_id": current['id'], "session_id": session_id,
         "role": "user", "content": payload.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": current['id'], "session_id": session_id,
         "role": "assistant", "content": reply, "created_at": now},
    ]).execute()

    return ChatResponse(session_id=session_id, reply=reply)

@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str, current=Depends(get_current_user)):
    response = supabase.table('chat_messages').select('*').eq('user_id', current['id']).eq('session_id', session_id).order('created_at', asc=True).execute()
    return [{"id": msg['id'], "role": msg['role'], "content": msg['content'], "created_at": msg['created_at']} for msg in response.data]

# ---------- FINANCIAL SETTINGS ----------

@api_router.get("/financial-settings")
async def get_financial_settings(current=Depends(get_current_user)):
    res = supabase.table('financial_settings').select('*').eq('user_id', current['id']).execute()
    if res.data:
        row = res.data[0]
        return {"monthly_income": float(row['monthly_income']), "monthly_limit": float(row['monthly_limit'])}
    return {"monthly_income": 0.0, "monthly_limit": 0.0}

@api_router.patch("/financial-settings")
async def update_financial_settings(payload: FinancialSettingsUpdate, current=Depends(get_current_user)):
    res = supabase.table('financial_settings').select('id').eq('user_id', current['id']).execute()
    data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.monthly_income is not None:
        data["monthly_income"] = payload.monthly_income
    if payload.monthly_limit is not None:
        data["monthly_limit"] = payload.monthly_limit

    if res.data:
        supabase.table('financial_settings').update(data).eq('user_id', current['id']).execute()
    else:
        data["id"] = str(uuid.uuid4())
        data["user_id"] = current['id']
        data.setdefault("monthly_income", 0.0)
        data.setdefault("monthly_limit", 0.0)
        supabase.table('financial_settings').insert(data).execute()

    updated = supabase.table('financial_settings').select('*').eq('user_id', current['id']).execute()
    row = updated.data[0]
    return {"monthly_income": float(row['monthly_income']), "monthly_limit": float(row['monthly_limit'])}


# ---------- CATEGORY LIMITS ----------

@api_router.get("/category-limits")
async def list_category_limits(current=Depends(get_current_user)):
    res = supabase.table('category_limits').select('*').eq('user_id', current['id']).execute()
    return [{"id": r['id'], "category_name": r['category_name'], "monthly_limit": float(r['monthly_limit']), "color": r['color']} for r in res.data]

@api_router.post("/category-limits")
async def upsert_category_limit(payload: CategoryLimitCreate, current=Depends(get_current_user)):
    existing = supabase.table('category_limits').select('id').eq('user_id', current['id']).eq('category_name', payload.category_name).execute()
    now = datetime.now(timezone.utc).isoformat()
    if existing.data:
        supabase.table('category_limits').update({
            "monthly_limit": payload.monthly_limit,
            "color": payload.color or "#16A34A",
            "updated_at": now,
        }).eq('id', existing.data[0]['id']).execute()
        row_id = existing.data[0]['id']
    else:
        row_id = str(uuid.uuid4())
        supabase.table('category_limits').insert({
            "id": row_id,
            "user_id": current['id'],
            "category_name": payload.category_name,
            "monthly_limit": payload.monthly_limit,
            "color": payload.color or "#16A34A",
            "created_at": now,
            "updated_at": now,
        }).execute()
    res = supabase.table('category_limits').select('*').eq('id', row_id).execute()
    r = res.data[0]
    return {"id": r['id'], "category_name": r['category_name'], "monthly_limit": float(r['monthly_limit']), "color": r['color']}

@api_router.delete("/category-limits/{limit_id}")
async def delete_category_limit(limit_id: str, current=Depends(get_current_user)):
    supabase.table('category_limits').delete().eq('id', limit_id).eq('user_id', current['id']).execute()
    return {"ok": True}


# ---------- SPENDING ALERTS ----------

@api_router.get("/spending-alerts")
async def list_spending_alerts(current=Depends(get_current_user)):
    res = supabase.table('spending_alerts').select('*').eq('user_id', current['id']).execute()
    return [{"id": r['id'], "type": r['type'], "threshold_pct": r['threshold_pct'], "active": r['active']} for r in res.data]

@api_router.put("/spending-alerts")
async def upsert_spending_alert(payload: SpendingAlertUpdate, current=Depends(get_current_user)):
    existing = supabase.table('spending_alerts').select('id').eq('user_id', current['id']).eq('type', payload.type).execute()
    now = datetime.now(timezone.utc).isoformat()
    if existing.data:
        supabase.table('spending_alerts').update({
            "threshold_pct": payload.threshold_pct,
            "active": payload.active,
            "updated_at": now,
        }).eq('id', existing.data[0]['id']).execute()
        row_id = existing.data[0]['id']
    else:
        row_id = str(uuid.uuid4())
        supabase.table('spending_alerts').insert({
            "id": row_id,
            "user_id": current['id'],
            "type": payload.type,
            "threshold_pct": payload.threshold_pct,
            "active": payload.active,
            "created_at": now,
            "updated_at": now,
        }).execute()
    res = supabase.table('spending_alerts').select('*').eq('id', row_id).execute()
    r = res.data[0]
    return {"id": r['id'], "type": r['type'], "threshold_pct": r['threshold_pct'], "active": r['active']}

# ---------- SETUP ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
