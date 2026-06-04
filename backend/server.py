from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
import ast
import base64
import hashlib
import bcrypt
import jwt
import requests
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

try:
    import anthropic
except Exception:
    anthropic = None
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
OPEN_FINANCE_PROVIDER = os.environ.get('OPEN_FINANCE_PROVIDER', 'mock').lower()
OPEN_FINANCE_SYNC_ON_OPEN = os.environ.get('OPEN_FINANCE_SYNC_ON_OPEN', 'true').lower() == 'true'

PLUGGY_BASE_URL = os.environ.get('PLUGGY_BASE_URL', 'https://api.pluggy.ai')
PLUGGY_CLIENT_ID = os.environ.get('PLUGGY_CLIENT_ID', '')
PLUGGY_CLIENT_SECRET = os.environ.get('PLUGGY_CLIENT_SECRET', '')
OF_TOKEN_KEY = os.environ.get('OF_TOKEN_KEY', '')

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

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class AccountDelete(BaseModel):
    password: str

class AuthResponse(BaseModel):
    token: str
    user: UserOut

class GoogleLogin(BaseModel):
    google_id: str
    email: EmailStr
    name: str
    avatar_url: Optional[str] = None

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
    image_url: Optional[str] = None
    emoji: Optional[str] = None

class GoalOut(BaseModel):
    id: str
    user_id: str
    title: str
    target_amount: float
    current_amount: float
    deadline: Optional[datetime] = None
    icon: str
    color: str
    image_url: Optional[str] = None
    emoji: Optional[str] = None
    created_at: datetime

class GoalUpdate(BaseModel):
    current_amount: Optional[float] = None
    target_amount: Optional[float] = None
    title: Optional[str] = None
    image_url: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    tone: Optional[Literal['motivador', 'rigido', 'engracado']] = None
    personality: Optional[str] = None

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

# ---------- OPEN FINANCE MODELS ----------

BankConnectionStatus = Literal['connected', 'syncing', 'error', 'reauth_required']

class BankInstitutionOut(BaseModel):
    id: str
    name: str
    provider: str = 'pluggy'
    logo_url: Optional[str] = None

class BankConnectRequest(BaseModel):
    institution_id: str
    institution_name: Optional[str] = None
    provider_item_id: Optional[str] = None


class ConnectTokenRequest(BaseModel):
    client_user_id: Optional[str] = None

class BankConnectionOut(BaseModel):
    id: str
    user_id: str
    institution_id: str
    institution_name: str
    status: BankConnectionStatus
    last_sync: Optional[datetime] = None
    created_at: datetime

class BankAccountOut(BaseModel):
    id: str
    connection_id: str
    account_name: str
    account_type: str
    balance: float
    currency: str = 'BRL'

class BankCardOut(BaseModel):
    id: str
    connection_id: str
    card_name: str
    card_brand: str
    limit_total: float
    limit_available: float
    invoice_amount: float
    due_date: Optional[str] = None

class BankConnectionDetailsOut(BaseModel):
    connection: BankConnectionOut
    accounts: List[BankAccountOut]
    cards: List[BankCardOut]

class OpenFinanceStatusOut(BaseModel):
    mode: Literal['real', 'mock']
    provider: str
    provider_configured: bool
    sync_on_open: bool
    fallback_reason: Optional[str] = None

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
        avatar_url=_resolve_avatar_url(user.get('avatar_url')),
        created_at=user['created_at'],
    )

def _extract_storage_public_url(value: object) -> Optional[str]:
    if isinstance(value, dict):
        data = value.get("data") if isinstance(value.get("data"), dict) else {}
        url = (
            value.get("publicUrl")
            or value.get("publicURL")
            or value.get("signedUrl")
            or value.get("signedURL")
            or data.get("publicUrl")
            or data.get("publicURL")
            or data.get("signedUrl")
            or data.get("signedURL")
        )
        return url if isinstance(url, str) else None
    return value if isinstance(value, str) else None

def _extract_avatar_path(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value.startswith("data:"):
        return None
    if value.startswith("http"):
        markers = [
            "/storage/v1/object/public/avatars/",
            "/storage/v1/object/sign/avatars/",
            "/object/public/avatars/",
            "/object/sign/avatars/",
        ]
        for marker in markers:
            if marker in value:
                return value.split(marker, 1)[1].split("?", 1)[0]
        return None
    return value

def _resolve_avatar_url(raw_value: Optional[object]) -> Optional[str]:
    if raw_value is None:
        return None

    value: object = raw_value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                value = json.loads(stripped)
            except Exception:
                try:
                    value = ast.literal_eval(stripped)
                except Exception:
                    value = stripped
        else:
            value = stripped

    direct_url = _extract_storage_public_url(value)
    if isinstance(direct_url, str) and direct_url.startswith("http"):
        return direct_url
    if isinstance(direct_url, str) and direct_url.startswith("data:"):
        return direct_url

    path = _extract_avatar_path(direct_url if isinstance(direct_url, str) else None)
    if not path:
        return direct_url if isinstance(direct_url, str) else None

    try:
        signed_result = supabase.storage.from_("avatars").create_signed_url(path, 60 * 60 * 24 * 30)
        signed = _extract_storage_public_url(signed_result)
        if isinstance(signed, str):
            if signed.startswith("http"):
                return signed
            if signed.startswith("/") and SUPABASE_URL:
                return f"{SUPABASE_URL.rstrip('/')}{signed}"
    except Exception:
        pass

    try:
        public_result = supabase.storage.from_("avatars").get_public_url(path)
        public_url = _extract_storage_public_url(public_result)
        if isinstance(public_url, str) and public_url.startswith("http"):
            return public_url
    except Exception:
        pass

    return direct_url if isinstance(direct_url, str) else None

def _extract_avatar_path_from_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value.startswith("goals/"):
        return value

    markers = [
        "/storage/v1/object/public/avatars/",
        "/storage/v1/object/sign/avatars/",
        "/object/public/avatars/",
        "/object/sign/avatars/",
    ]
    for marker in markers:
        if marker in value:
            return value.split(marker, 1)[1].split("?", 1)[0]
    return None

def _resolve_goal_image_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    if value.startswith("data:"):
        return value

    path = _extract_avatar_path_from_url(value) if value.startswith("http") else value
    if not path:
        return value

    # Tenta signed URL primeiro (funciona em bucket privado)
    try:
        signed_result = supabase.storage.from_("avatars").create_signed_url(path, 60 * 60 * 24 * 30)
        if isinstance(signed_result, dict):
            data = signed_result.get("data") if isinstance(signed_result.get("data"), dict) else {}
            signed = (
                signed_result.get("signedUrl")
                or signed_result.get("signedURL")
                or data.get("signedUrl")
                or data.get("signedURL")
            )
            if isinstance(signed, str):
                if signed.startswith("http"):
                    return signed
                if signed.startswith("/") and SUPABASE_URL:
                    return f"{SUPABASE_URL.rstrip('/')}{signed}"
        elif isinstance(signed_result, str) and signed_result.startswith("http"):
            return signed_result
    except Exception:
        pass

    # Fallback para bucket público
    try:
        public_result = supabase.storage.from_("avatars").get_public_url(path)
        if isinstance(public_result, dict):
            data = public_result.get("data") if isinstance(public_result.get("data"), dict) else {}
            public = (
                public_result.get("publicUrl")
                or public_result.get("publicURL")
                or data.get("publicUrl")
                or data.get("publicURL")
            )
        else:
            public = public_result
        if isinstance(public, str) and public.startswith("http"):
            return public
    except Exception:
        pass

    return value

OPEN_FINANCE_INSTITUTIONS = [
    {"id": "nubank", "name": "Nubank"},
    {"id": "inter", "name": "Banco Inter"},
    {"id": "itau", "name": "Itaú"},
    {"id": "bradesco", "name": "Bradesco"},
    {"id": "santander", "name": "Santander"},
    {"id": "bb", "name": "Banco do Brasil"},
    {"id": "caixa", "name": "Caixa"},
    {"id": "c6", "name": "C6 Bank"},
    {"id": "neon", "name": "Neon"},
    {"id": "mercado_pago", "name": "Mercado Pago"},
]

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default

def _normalize_of_status(value: Optional[str]) -> BankConnectionStatus:
    status = (value or "connected").lower()
    if status in ("connected", "syncing", "error", "reauth_required"):
        return status  # type: ignore[return-value]
    if status in ("warning", "login_error", "item_error"):
        return "reauth_required"
    return "connected"

def _open_finance_provider_ready() -> bool:
    if OPEN_FINANCE_PROVIDER == "pluggy":
        return bool(PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET)
    return OPEN_FINANCE_PROVIDER not in ("", "mock")

def _open_finance_status_payload() -> OpenFinanceStatusOut:
    ready = _open_finance_provider_ready()
    mode: Literal['real', 'mock'] = 'real' if ready else 'mock'
    fallback_reason = None
    if mode == 'mock':
        if OPEN_FINANCE_PROVIDER == 'pluggy' and not ready:
            fallback_reason = 'Pluggy não configurado (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET)'
        elif OPEN_FINANCE_PROVIDER == 'mock':
            fallback_reason = 'OPEN_FINANCE_PROVIDER=mock'
        else:
            fallback_reason = 'Provedor Open Finance sem configuração válida'

    return OpenFinanceStatusOut(
        mode=mode,
        provider=OPEN_FINANCE_PROVIDER,
        provider_configured=ready,
        sync_on_open=OPEN_FINANCE_SYNC_ON_OPEN,
        fallback_reason=fallback_reason,
    )

def _of_crypto_key() -> bytes:
    seed = OF_TOKEN_KEY or JWT_SECRET or "nocker-open-finance"
    digest = hashlib.sha256(seed.encode()).digest()
    return base64.urlsafe_b64encode(digest)

def _encrypt_secret(value: str) -> str:
    try:
        from cryptography.fernet import Fernet
        return Fernet(_of_crypto_key()).encrypt(value.encode()).decode()
    except Exception:
        return value

def _decrypt_secret(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    try:
        from cryptography.fernet import Fernet
        return Fernet(_of_crypto_key()).decrypt(value.encode()).decode()
    except Exception:
        return value

def _classify_category(description: str, amount: float) -> str:
    d = (description or "").lower()
    rules = [
        ("mercado|ifood|restaurante|padaria|açougue|supermercado", "Alimentação"),
        ("uber|99|combust|posto|estacionamento|metro|onibus", "Transporte"),
        ("farmacia|hospital|clinica|medic", "Saúde"),
        ("aluguel|condominio|energia|luz|agua|gas|internet|moradia", "Moradia"),
        ("netflix|spotify|prime|disney|assinatura", "Assinaturas"),
        ("cinema|bar|lazer|show|stream", "Lazer"),
        ("salario|folha|pagamento empresa", "Salário"),
        ("ted|doc|pix|transfer", "Transferências"),
        ("curso|faculdade|escola|educ", "Educação"),
        ("invest|corretora|tesouro|cdb|fii", "Investimentos"),
    ]
    for pattern, category in rules:
        import re
        if re.search(pattern, d):
            return category
    return "Compras" if amount < 0 else "Receitas"

def _tx_type_from_amount(amount: float) -> str:
    return "income" if amount >= 0 else "expense"

def _pluggy_headers() -> dict:
    if not PLUGGY_CLIENT_ID or not PLUGGY_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Pluggy não configurado")

    auth = requests.post(
        f"{PLUGGY_BASE_URL.rstrip('/')}/auth",
        json={"clientId": PLUGGY_CLIENT_ID, "clientSecret": PLUGGY_CLIENT_SECRET},
        timeout=20,
    )
    if auth.status_code >= 300:
        raise HTTPException(status_code=502, detail="Falha ao autenticar no provedor Open Finance")
    data = auth.json()
    token = data.get("apiKey") or data.get("accessToken")
    if not token:
        raise HTTPException(status_code=502, detail="Token do provedor Open Finance inválido")
    return {"X-API-KEY": token, "Content-Type": "application/json"}

def _pluggy_request(method: str, path: str, payload: Optional[dict] = None) -> dict:
    headers = _pluggy_headers()
    url = f"{PLUGGY_BASE_URL.rstrip('/')}{path}"
    res = requests.request(method, url, headers=headers, json=payload, timeout=30)
    if res.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"Erro no provedor Open Finance: {res.text[:180]}")
    return res.json() if res.text else {}


def _create_pluggy_connect_token(client_user_id: str) -> dict:
    payload = {
        "options": {
            "clientUserId": client_user_id,
        }
    }
    return _pluggy_request("POST", "/connect_token", payload)

def _upsert_bank_account(connection_id: str, account: dict) -> None:
    account_id = account["id"]
    now = _now_iso()
    existing = supabase.table("bank_accounts").select("id").eq("id", account_id).execute()
    payload = {
        "id": account_id,
        "connection_id": connection_id,
        "account_name": account.get("account_name") or "Conta",
        "account_type": account.get("account_type") or "checking",
        "balance": _safe_float(account.get("balance")),
        "currency": account.get("currency") or "BRL",
        "updated_at": now,
    }
    if existing.data:
        supabase.table("bank_accounts").update(payload).eq("id", account_id).execute()
    else:
        payload["created_at"] = now
        supabase.table("bank_accounts").insert(payload).execute()

def _upsert_bank_card(connection_id: str, card: dict) -> None:
    card_id = card["id"]
    now = _now_iso()
    existing = supabase.table("bank_cards").select("id").eq("id", card_id).execute()
    payload = {
        "id": card_id,
        "connection_id": connection_id,
        "card_name": card.get("card_name") or "Cartão",
        "card_brand": card.get("card_brand") or "visa",
        "limit_total": _safe_float(card.get("limit_total")),
        "limit_available": _safe_float(card.get("limit_available")),
        "invoice_amount": _safe_float(card.get("invoice_amount")),
        "due_date": card.get("due_date"),
        "updated_at": now,
    }
    if existing.data:
        supabase.table("bank_cards").update(payload).eq("id", card_id).execute()
    else:
        payload["created_at"] = now
        supabase.table("bank_cards").insert(payload).execute()

def _upsert_transaction_from_bank(user_id: str, account_id: Optional[str], tx: dict) -> None:
    tx_id = tx["id"]
    amount = _safe_float(tx.get("amount"))
    tx_type = _tx_type_from_amount(amount)
    abs_amount = abs(amount)
    description = tx.get("description") or "Transação bancária"
    date_str = tx.get("transaction_date") or _now_iso()
    category = tx.get("category") or _classify_category(description, amount)

    link = supabase.table("bank_transaction_links").select("id,transaction_id").eq("id", tx_id).execute()
    if link.data:
        tr_id = link.data[0]["transaction_id"]
        supabase.table("transactions").update({
            "description": description,
            "amount": abs_amount,
            "type": tx_type,
            "category": category,
            "date": date_str,
        }).eq("id", tr_id).eq("user_id", user_id).execute()
        return

    created_at = _now_iso()
    tx_row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": tx_type,
        "amount": abs_amount,
        "category": category,
        "description": description,
        "date": date_str,
        "card_id": None,
        "created_at": created_at,
    }
    supabase.table("transactions").insert(tx_row).execute()
    supabase.table("bank_transaction_links").insert({
        "id": tx_id,
        "transaction_id": tx_row["id"],
        "user_id": user_id,
        "bank_account_id": account_id,
        "created_at": created_at,
    }).execute()

def _mock_accounts_for_connection(connection: dict) -> List[dict]:
    prefix = connection["id"][:8]
    return [
        {
            "id": f"acc-{prefix}-001",
            "account_name": "Conta Corrente",
            "account_type": "checking",
            "balance": 3520.74,
            "currency": "BRL",
        },
        {
            "id": f"acc-{prefix}-002",
            "account_name": "Conta Poupança",
            "account_type": "savings",
            "balance": 12800.10,
            "currency": "BRL",
        },
    ]

def _mock_cards_for_connection(connection: dict) -> List[dict]:
    prefix = connection["id"][:8]
    return [
        {
            "id": f"card-{prefix}-001",
            "card_name": f"{connection['institution_name']} Platinum",
            "card_brand": "visa",
            "limit_total": 9000.0,
            "limit_available": 5400.0,
            "invoice_amount": 3600.0,
            "due_date": "15",
        }
    ]

def _mock_transactions_for_connection(connection: dict, account_id: str) -> List[dict]:
    now = datetime.now(timezone.utc)
    base = connection["id"][:8]
    return [
        {
            "id": f"tx-{base}-001",
            "description": "PIX recebido Salário",
            "amount": 4200.00,
            "transaction_date": (now - timedelta(days=2)).isoformat(),
            "category": "Salário",
        },
        {
            "id": f"tx-{base}-002",
            "description": "Supermercado",
            "amount": -289.30,
            "transaction_date": (now - timedelta(days=1)).isoformat(),
            "category": "Alimentação",
        },
        {
            "id": f"tx-{base}-003",
            "description": "Uber",
            "amount": -42.55,
            "transaction_date": now.isoformat(),
            "category": "Transporte",
        },
    ]

def _sync_open_finance_connection(connection: dict, user_id: str) -> None:
    now = _now_iso()
    supabase.table("bank_connections").update({"status": "syncing", "updated_at": now}).eq("id", connection["id"]).execute()
    try:
        if OPEN_FINANCE_PROVIDER == "pluggy" and PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET:
            provider_item_id = _decrypt_secret(connection.get("provider_item_id")) or ""
            if not provider_item_id:
                raise HTTPException(status_code=400, detail="Conexão sem item do provedor")

            account_payload = _pluggy_request("GET", f"/accounts?itemId={provider_item_id}")
            card_payload = _pluggy_request("GET", f"/accounts?itemId={provider_item_id}&type=CREDIT")
            tx_payload = _pluggy_request("GET", f"/transactions?itemId={provider_item_id}&pageSize=300")

            accounts_data = account_payload.get("results") or account_payload.get("data") or []
            cards_data = card_payload.get("results") or card_payload.get("data") or []
            tx_data = tx_payload.get("results") or tx_payload.get("data") or []

            normalized_accounts = [
                {
                    "id": f"acc-{a.get('id')}",
                    "account_name": a.get("name") or "Conta",
                    "account_type": (a.get("type") or "checking").lower(),
                    "balance": _safe_float(a.get("balance")),
                    "currency": a.get("currencyCode") or "BRL",
                }
                for a in accounts_data
            ]
            normalized_cards = [
                {
                    "id": f"card-{c.get('id')}",
                    "card_name": c.get("name") or "Cartão",
                    "card_brand": (c.get("subtype") or "visa").lower(),
                    "limit_total": _safe_float(c.get("creditData", {}).get("limit")),
                    "limit_available": _safe_float(c.get("creditData", {}).get("availableLimit")),
                    "invoice_amount": _safe_float(c.get("creditData", {}).get("usedLimit")),
                    "due_date": str(c.get("creditData", {}).get("closeDay") or ""),
                }
                for c in cards_data
            ]
            normalized_txs = [
                {
                    "id": f"plg-{t.get('id')}",
                    "description": t.get("description") or "Transação",
                    "amount": _safe_float(t.get("amount")),
                    "transaction_date": t.get("date") or now,
                    "category": _classify_category(t.get("description") or "", _safe_float(t.get("amount"))),
                }
                for t in tx_data
            ]
        else:
            normalized_accounts = _mock_accounts_for_connection(connection)
            normalized_cards = _mock_cards_for_connection(connection)
            normalized_txs = _mock_transactions_for_connection(connection, normalized_accounts[0]["id"]) if normalized_accounts else []

        for account in normalized_accounts:
            _upsert_bank_account(connection["id"], account)
        for card in normalized_cards:
            _upsert_bank_card(connection["id"], card)
        for tx in normalized_txs:
            _upsert_transaction_from_bank(user_id, normalized_accounts[0]["id"] if normalized_accounts else None, tx)

        supabase.table("bank_connections").update({
            "status": "connected",
            "last_sync": _now_iso(),
            "updated_at": _now_iso(),
            "last_error": None,
        }).eq("id", connection["id"]).execute()
    except HTTPException as e:
        supabase.table("bank_connections").update({
            "status": "error",
            "last_error": e.detail,
            "updated_at": _now_iso(),
        }).eq("id", connection["id"]).execute()
        raise
    except Exception as e:
        supabase.table("bank_connections").update({
            "status": "error",
            "last_error": str(e),
            "updated_at": _now_iso(),
        }).eq("id", connection["id"]).execute()
        raise HTTPException(status_code=500, detail="Falha ao sincronizar conexão bancária")

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

@api_router.post("/auth/google", response_model=AuthResponse)
async def google_login(payload: GoogleLogin):
    # Busca usuário pelo google_id ou email
    response = supabase.table('users').select('*').eq('email', payload.email.lower()).execute()
    user = response.data[0] if response.data else None

    if user:
        # Usuário já existe — atualiza google_id e avatar se necessário
        update_data: dict = {}
        if not user.get('google_id'):
            update_data['google_id'] = payload.google_id
        if payload.avatar_url and not user.get('avatar_url'):
            update_data['avatar_url'] = payload.avatar_url
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            res = supabase.table('users').update(update_data).eq('id', user['id']).execute()
            user = res.data[0] if res.data else user
    else:
        # Cria novo usuário via Google
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "name": payload.name.strip(),
            "email": payload.email.lower(),
            "password": hash_password(payload.google_id),  # senha fictícia, não usada
            "google_id": payload.google_id,
            "avatar_url": payload.avatar_url,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table('users').insert(user).execute()

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

@api_router.patch("/auth/password", response_model=UserOut)
async def change_password(payload: PasswordChange, current=Depends(get_current_user)):
    if not verify_password(payload.current_password, current['password']):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter ao menos 6 caracteres")
    response = supabase.table('users').update({
        'password': hash_password(payload.new_password),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }).eq('id', current['id']).select('*').execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user_to_out(response.data[0])

@api_router.delete("/auth/account")
async def delete_account(payload: AccountDelete, current=Depends(get_current_user)):
    if not verify_password(payload.password, current['password']):
        raise HTTPException(status_code=400, detail="Senha incorreta")
    user_id = current['id']
    for table in (
        'chat_messages', 'spending_alerts', 'category_limits', 'financial_settings',
        'categories', 'subscriptions', 'installments', 'fixed_expenses', 'goals', 'cards', 'transactions',
    ):
        supabase.table(table).delete().eq('user_id', user_id).execute()
    supabase.table('users').delete().eq('id', user_id).execute()
    return {"ok": True}

@api_router.post("/auth/avatar/upload", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), current=Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use JPG ou PNG.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx. 5MB).")

    ext = "jpg" if "jpeg" in content_type or content_type == "image/jpg" else "png" if content_type == "image/png" else "webp"
    path = f"{current['id']}/avatar.{ext}"

    try:
        supabase.storage.from_("avatars").upload(
            path,
            content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        avatar_url = path
    except Exception as storage_err:
        logging.warning("Avatar storage upload failed, saving inline: %s", storage_err)
        import base64
        if len(content) > 500_000:
            raise HTTPException(status_code=400, detail="Imagem muito grande. Escolha uma foto menor.")
        b64 = base64.b64encode(content).decode()
        avatar_url = f"data:{content_type};base64,{b64}"

    response = supabase.table("users").update({
        "avatar_url": avatar_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current["id"]).execute()
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

# ---------- OPEN FINANCE ----------
@api_router.get("/open-finance/status", response_model=OpenFinanceStatusOut)
async def open_finance_status(current=Depends(get_current_user)):
    return _open_finance_status_payload()


@api_router.post("/open-finance/connect-token")
async def create_open_finance_connect_token(payload: ConnectTokenRequest, current=Depends(get_current_user)):
    if OPEN_FINANCE_PROVIDER != "pluggy":
        raise HTTPException(status_code=400, detail="Connect Token só está disponível para Pluggy")
    if not (PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="Pluggy não configurado no backend")

    client_user_id = (payload.client_user_id or current["id"]).strip()
    if not client_user_id:
        raise HTTPException(status_code=400, detail="client_user_id inválido")

    return _create_pluggy_connect_token(client_user_id)

@api_router.get("/open-finance/institutions", response_model=List[BankInstitutionOut])
async def list_open_finance_institutions(current=Depends(get_current_user)):
    if OPEN_FINANCE_PROVIDER == "pluggy" and PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET:
        try:
            payload = _pluggy_request("GET", "/institutions")
            rows = payload.get("results") or payload.get("data") or []
            out = []
            for row in rows:
                out.append(BankInstitutionOut(
                    id=str(row.get("id") or row.get("itemId") or row.get("name", "").lower().replace(" ", "_")),
                    name=row.get("name") or "Instituição",
                    provider="pluggy",
                    logo_url=row.get("imageUrl") or row.get("logoUrl"),
                ))
            if out:
                return out
        except Exception:
            pass
    return [BankInstitutionOut(id=i["id"], name=i["name"], provider=OPEN_FINANCE_PROVIDER) for i in OPEN_FINANCE_INSTITUTIONS]

@api_router.get("/open-finance/connections", response_model=List[BankConnectionDetailsOut])
async def list_open_finance_connections(current=Depends(get_current_user)):
    conn_res = supabase.table("bank_connections").select("*").eq("user_id", current["id"]).order("created_at", desc=True).execute()
    connections = conn_res.data or []
    out: List[BankConnectionDetailsOut] = []
    for conn in connections:
        account_res = supabase.table("bank_accounts").select("*").eq("connection_id", conn["id"]).execute()
        card_res = supabase.table("bank_cards").select("*").eq("connection_id", conn["id"]).execute()
        out.append(BankConnectionDetailsOut(
            connection=BankConnectionOut(
                id=conn["id"],
                user_id=conn["user_id"],
                institution_id=conn["institution_id"],
                institution_name=conn["institution_name"],
                status=_normalize_of_status(conn.get("status")),
                last_sync=conn.get("last_sync"),
                created_at=conn["created_at"],
            ),
            accounts=[BankAccountOut(**a) for a in (account_res.data or [])],
            cards=[BankCardOut(**c) for c in (card_res.data or [])],
        ))
    return out

@api_router.post("/open-finance/connections/connect", response_model=BankConnectionDetailsOut)
async def connect_open_finance_bank(payload: BankConnectRequest, current=Depends(get_current_user)):
    institution_name = payload.institution_name
    if not institution_name:
        match = next((i for i in OPEN_FINANCE_INSTITUTIONS if i["id"] == payload.institution_id), None)
        institution_name = match["name"] if match else payload.institution_id

    now = _now_iso()
    conn_id = str(uuid.uuid4())
    provider_item_id = ""
    if OPEN_FINANCE_PROVIDER == "pluggy":
        if not (PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET):
            raise HTTPException(status_code=503, detail="Pluggy não configurado no backend")
        item_id = (payload.provider_item_id or "").strip()
        if not item_id:
            raise HTTPException(
                status_code=400,
                detail="Conexão real exige provider_item_id do Pluggy (itemId)"
            )
        provider_item_id = _encrypt_secret(item_id)

    row = {
        "id": conn_id,
        "user_id": current["id"],
        "institution_id": payload.institution_id,
        "institution_name": institution_name,
        "status": "syncing",
        "provider": OPEN_FINANCE_PROVIDER,
        "provider_item_id": provider_item_id,
        "last_sync": None,
        "last_error": None,
        "created_at": now,
        "updated_at": now,
    }
    supabase.table("bank_connections").insert(row).execute()

    _sync_open_finance_connection(row, current["id"])
    listed = await list_open_finance_connections(current)
    found = next((x for x in listed if x.connection.id == conn_id), None)
    if not found:
        raise HTTPException(status_code=500, detail="Conexão criada, mas não foi possível carregar dados")
    return found

@api_router.post("/open-finance/connections/{connection_id}/sync", response_model=BankConnectionDetailsOut)
async def sync_open_finance_connection(connection_id: str, current=Depends(get_current_user)):
    conn_res = supabase.table("bank_connections").select("*").eq("id", connection_id).eq("user_id", current["id"]).execute()
    if not conn_res.data:
        raise HTTPException(status_code=404, detail="Conexão bancária não encontrada")
    conn = conn_res.data[0]
    _sync_open_finance_connection(conn, current["id"])
    listed = await list_open_finance_connections(current)
    found = next((x for x in listed if x.connection.id == connection_id), None)
    if not found:
        raise HTTPException(status_code=500, detail="Falha ao carregar conexão sincronizada")
    return found

@api_router.post("/open-finance/sync-all")
async def sync_all_open_finance(current=Depends(get_current_user)):
    conn_res = supabase.table("bank_connections").select("*").eq("user_id", current["id"]).execute()
    rows = conn_res.data or []
    for conn in rows:
        try:
            _sync_open_finance_connection(conn, current["id"])
        except Exception:
            continue
    return {"ok": True, "connections": len(rows)}

@api_router.delete("/open-finance/connections/{connection_id}")
async def disconnect_open_finance(connection_id: str, current=Depends(get_current_user)):
    conn_res = supabase.table("bank_connections").select("id").eq("id", connection_id).eq("user_id", current["id"]).execute()
    if not conn_res.data:
        raise HTTPException(status_code=404, detail="Conexão bancária não encontrada")

    account_res = supabase.table("bank_accounts").select("id").eq("connection_id", connection_id).execute()
    account_ids = [a["id"] for a in (account_res.data or [])]
    if account_ids:
        links = supabase.table("bank_transaction_links").select("id,transaction_id").eq("user_id", current["id"]).in_("bank_account_id", account_ids).execute()
        link_rows = links.data or []
        tx_ids = [r["transaction_id"] for r in link_rows]
        if tx_ids:
            supabase.table("transactions").delete().eq("user_id", current["id"]).in_("id", tx_ids).execute()
        supabase.table("bank_transaction_links").delete().eq("user_id", current["id"]).in_("bank_account_id", account_ids).execute()

    supabase.table("bank_cards").delete().eq("connection_id", connection_id).execute()
    supabase.table("bank_accounts").delete().eq("connection_id", connection_id).execute()
    supabase.table("bank_connections").delete().eq("id", connection_id).eq("user_id", current["id"]).execute()
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
        "image_url": payload.image_url,
        "emoji": payload.emoji,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('goals').insert(doc).execute()
    return GoalOut(**doc)

@api_router.post("/goals/{goal_id}/image", response_model=GoalOut)
async def upload_goal_image(goal_id: str, file: UploadFile = File(...), current=Depends(get_current_user)):
    # Verifica que a meta pertence ao usuário
    res = supabase.table('goals').select('*').eq('id', goal_id).eq('user_id', current['id']).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Meta não encontrada")

    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use JPG, PNG ou WEBP.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx 10MB)")

    ext = "jpg" if "jpeg" in content_type or content_type == "image/jpg" else "png" if content_type == "image/png" else "webp"
    path = f"goals/{current['id']}/{goal_id}.{ext}"

    supabase.storage.from_("avatars").upload(
        path,
        content,
        file_options={"content-type": content_type, "upsert": "true"},
    )

    # Persiste o path estável; a URL de exibição é resolvida no retorno
    response = supabase.table('goals').update({"image_url": path}).eq('id', goal_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Meta não encontrada")

    item = response.data[0]
    item["image_url"] = _resolve_goal_image_url(item.get("image_url"))
    return GoalOut(**item)

@api_router.get("/goals", response_model=List[GoalOut])
async def list_goals(current=Depends(get_current_user)):
    response = supabase.table('goals').select('*').eq('user_id', current['id']).order('created_at', desc=True).limit(100).execute()
    items = response.data or []
    for item in items:
        item["image_url"] = _resolve_goal_image_url(item.get("image_url"))
    return [GoalOut(**i) for i in items]

@api_router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, payload: GoalUpdate, current=Depends(get_current_user)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    response = supabase.table('goals').update(update).eq('id', goal_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    item = response.data[0]
    item["image_url"] = _resolve_goal_image_url(item.get("image_url"))
    return GoalOut(**item)

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

    # Busca estado atual antes de atualizar (usa limit(1) em vez de .single() para evitar exceção)
    current_res = supabase.table('installments').select('*').eq('id', i_id).eq('user_id', current['id']).limit(1).execute()
    if not current_res.data:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    current_item = current_res.data[0]
    old_paid = int(current_item.get("installments_paid", 0))

    # Atualiza o parcelamento
    response = supabase.table('installments').update(update).eq('id', i_id).eq('user_id', current['id']).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    updated_item = response.data[0]

    # Se pagou exatamente +1 parcela, registra despesa automaticamente
    new_paid = update.get("installments_paid")
    if new_paid is not None and int(new_paid) == old_paid + 1:
        total_amount = float(current_item["total_amount"])
        total_installments = max(int(current_item["installments_total"]), 1)
        monthly_amount = round(total_amount / total_installments, 2)
        tx_doc = {
            "id": str(uuid.uuid4()),
            "user_id": current['id'],
            "type": "expense",
            "amount": monthly_amount,
            "category": current_item["category"],
            "description": f"{current_item['name']} — parcela {new_paid}/{current_item['installments_total']}",
            "date": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # Só inclui card_id se existir
        card_id = current_item.get("card_id")
        if card_id:
            tx_doc["card_id"] = card_id
        try:
            supabase.table('transactions').insert(tx_doc).execute()
        except Exception as e:
            # Loga mas não bloqueia a resposta — parcela já foi marcada
            print(f"[WARN] Falha ao criar transação para parcela: {e}")

    return InstallmentOut(**_installment_compute(updated_item))


@api_router.post("/installments/{i_id}/pay")
async def pay_installment(i_id: str, current=Depends(get_current_user)):
    """Marca a próxima parcela como paga e cria a transação de despesa automaticamente."""
    # Busca o parcelamento atual
    res = supabase.table('installments').select('*').eq('id', i_id).eq('user_id', current['id']).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    item = res.data[0]

    old_paid = int(item["installments_paid"])
    total_inst = int(item["installments_total"])

    if old_paid >= total_inst:
        raise HTTPException(status_code=400, detail="Todas as parcelas já foram pagas")

    new_paid = old_paid + 1
    monthly_amount = round(float(item["total_amount"]) / max(total_inst, 1), 2)

    # Atualiza o parcelamento
    upd = supabase.table('installments').update({"installments_paid": new_paid}).eq('id', i_id).eq('user_id', current['id']).execute()
    if not upd.data:
        raise HTTPException(status_code=500, detail="Erro ao atualizar parcelamento")

    # Cria a transação de despesa
    tx_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current['id'],
        "type": "expense",
        "amount": monthly_amount,
        "category": item["category"],
        "description": f"{item['name']} — parcela {new_paid}/{total_inst}",
        "date": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if item.get("card_id"):
        tx_doc["card_id"] = item["card_id"]

    tx_res = supabase.table('transactions').insert(tx_doc).execute()
    if not tx_res.data:
        raise HTTPException(status_code=500, detail="Erro ao registrar transação")

    return {
        "installment": InstallmentOut(**_installment_compute(upd.data[0])),
        "transaction": TransactionOut(**tx_res.data[0]),
        "message": f"Parcela {new_paid}/{total_inst} registrada com sucesso",
    }

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
    response = supabase.table('categories').select('*').eq('user_id', current['id']).order('created_at', desc=False).limit(200).execute()
    return [CategoryOut(**i) for i in response.data]

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

def _tone_instruction(tone: Optional[str]) -> str:
    tones = {
        'motivador': (
            'Tom motivador: seja encorajador, celebre pequenas vitórias e motive o usuário '
            'a continuar melhorando suas finanças. Use emojis com moderação.'
        ),
        'rigido': (
            'Tom rígido: seja direto, objetivo e firme. Foque em disciplina financeira, '
            'metas claras e ações práticas. Evite rodeios e excesso de emojis.'
        ),
        'engracado': (
            'Tom engraçado: use humor leve e descontraído, com emojis moderados, '
            'mantendo conselhos financeiros úteis e precisos.'
        ),
    }
    return tones.get(tone or 'motivador', tones['motivador']) + '\n\n'

def _personality_instruction(personality: str) -> str:
    text = personality.strip()
    if not text:
        return ''
    return f'Personalidade adicional definida pelo usuário: {text}\n\n'

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
        "criar metas e dar insights inteligentes. Responda sempre em português brasileiro. "
        "Use no máximo 4 parágrafos curtos.\n\n"
        + _tone_instruction(payload.tone)
        + (_personality_instruction(payload.personality) if payload.personality else "")
        + f"\nContexto financeiro do usuário ({current['name']}):\n" + "\n".join(context_lines)
    )

    # load history from db (last 20 messages)
    history_response = supabase.table('chat_messages').select('*').eq('user_id', current['id']).eq('session_id', session_id).order('created_at', asc=True).limit(20).execute()
    history = history_response.data if history_response.data else []

    try:
        if anthropic is None:
            raise HTTPException(status_code=503, detail="IA temporariamente indisponível neste ambiente")
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

@app.get("/")
async def root_health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)