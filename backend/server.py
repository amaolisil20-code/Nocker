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
