from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import asyncio
import logging
import json
import ast
import base64
import hashlib
import secrets
import bcrypt
import jwt
import requests
from collections import defaultdict, deque
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
import time
from datetime import datetime, timezone, timedelta

try:
    import anthropic
except Exception:
    anthropic = None
from supabase import create_client, Client
from ocr_parser import parse_ocr_text as _parse_ocr_text
from ocr_vision import extract_from_image as _extract_from_image

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
# Chave(s) antiga(s) do Open Finance, separadas por vírgula. Usadas só como
# fallback para DESCRIPTOGRAFAR dados já existentes durante uma rotação de
# OF_TOKEN_KEY — nunca para criptografar. Remova depois que o script
# scripts/rotate_of_token_key.py confirmar que todos os registros foram
# migrados para a chave nova.
OF_TOKEN_KEY_LEGACY = os.environ.get('OF_TOKEN_KEY_LEGACY', '')

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
    access_token: str

class TransactionCreate(BaseModel):
    type: Literal['income', 'expense']
    amount: float
    category: str
    description: str
    date: Optional[datetime] = None
    card_id: Optional[str] = None

class NotificationTransactionIn(BaseModel):
    amount: float
    type: Literal['income', 'expense']
    description: str
    bank: Optional[str] = None
    raw: Optional[str] = None

class DocumentOcrParseIn(BaseModel):
    ocr_text: str

class DocumentOcrBase64In(BaseModel):
    image_base64: str
    content_type: Optional[str] = "image/jpeg"

class DocumentScanConfirmIn(BaseModel):
    establishment: str
    amount: float
    category: str
    transaction_date: Optional[datetime] = None
    ocr_text: Optional[str] = None
    type: Literal['income', 'expense'] = 'expense'

class ScannedDocumentOut(BaseModel):
    id: str
    user_id: str
    establishment: str
    amount: float
    category: str
    transaction_date: datetime
    ocr_text: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime

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
    last_error: Optional[str] = None
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

# ---------- RATE LIMITING (login) ----------
# Contador em memória de tentativas por chave (IP+email, ou só IP quando o
# e-mail ainda não é conhecido). Simples de propósito: o backend roda como
# processo único (sem múltiplas instâncias atrás de um load balancer), então
# não há necessidade de um backend compartilhado (Redis) para isso.
_LOGIN_ATTEMPTS: dict = defaultdict(deque)
_LOGIN_WINDOW_SECONDS = 15 * 60
_LOGIN_MAX_ATTEMPTS = 5

def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"

def _check_login_rate_limit(key: str) -> None:
    now = time.time()
    attempts = _LOGIN_ATTEMPTS[key]
    while attempts and now - attempts[0] > _LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas de login. Tente novamente em alguns minutos.",
        )
    attempts.append(now)

def _clear_login_rate_limit(key: str) -> None:
    _LOGIN_ATTEMPTS.pop(key, None)

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

def _of_crypto_keys() -> List[bytes]:
    """Chaves Fernet derivadas de OF_TOKEN_KEY (atual, usada para
    criptografar e como primeira tentativa de descriptografar) seguida das
    chaves de OF_TOKEN_KEY_LEGACY (só para descriptografar dados antigos
    durante uma rotação de chave — ver scripts/rotate_of_token_key.py)."""
    seeds = [OF_TOKEN_KEY or JWT_SECRET or "nocker-open-finance"]
    seeds += [s.strip() for s in OF_TOKEN_KEY_LEGACY.split(",") if s.strip()]
    return [base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest()) for seed in seeds]

def _encrypt_secret(value: str) -> str:
    try:
        from cryptography.fernet import Fernet
        return Fernet(_of_crypto_keys()[0]).encrypt(value.encode()).decode()
    except Exception:
        return value

def _decrypt_secret(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    from cryptography.fernet import Fernet
    for key in _of_crypto_keys():
        try:
            return Fernet(key).decrypt(value.encode()).decode()
        except Exception:
            continue
    logging.warning(
        "Não foi possível descriptografar um segredo do Open Finance com "
        "nenhuma chave configurada (OF_TOKEN_KEY / OF_TOKEN_KEY_LEGACY)."
    )
    return None

def _classify_category(description: str, amount: float, tx_type: Optional[str] = None) -> str:
    import re
    d = (description or "").lower()
    if "pix" in d:
        if tx_type == "income" or re.search(r"receb|credit|entrada", d):
            if re.search(r"salario|salário|folha", d):
                return "Salário"
            return "Receitas"
        return "Transferências"
    rules = [
        ("mercado|ifood|restaurante|padaria|açougue|supermercado", "Alimentação"),
        ("uber|99|combust|posto|estacionamento|metro|onibus", "Transporte"),
        ("farmacia|hospital|clinica|medic", "Saúde"),
        ("aluguel|condominio|energia|luz|agua|gas|internet|moradia", "Moradia"),
        ("netflix|spotify|prime|disney|assinatura", "Assinaturas"),
        ("cinema|bar|lazer|show|stream", "Lazer"),
        ("salario|folha|pagamento empresa", "Salário"),
        ("ted|doc|transfer", "Transferências"),
        ("curso|faculdade|escola|educ", "Educação"),
        ("invest|corretora|tesouro|cdb|fii", "Investimentos"),
    ]
    for pattern, category in rules:
        if re.search(pattern, d):
            return category
    if tx_type == "income":
        return "Receitas"
    return "Compras" if amount < 0 else "Receitas"

def _tx_type_from_amount(amount: float) -> str:
    return "income" if amount >= 0 else "expense"

def _pluggy_tx_type(tx: dict) -> str:
    raw = (tx.get("type") or "").upper()
    if raw == "CREDIT":
        return "income"
    if raw == "DEBIT":
        return "expense"
    amount = _safe_float(tx.get("amountInAccountCurrency") or tx.get("amount"))
    if amount < 0:
        return "expense"
    desc = (tx.get("description") or "").lower()
    if any(k in desc for k in ("recebido", "recebeu", "crédito", "credito", "entrada")):
        return "income"
    if any(k in desc for k in ("enviado", "enviou", "débito", "debito", "pagamento", "pago")):
        return "expense"
    return "income" if amount > 0 else "expense"

def _pluggy_tx_amount(tx: dict) -> float:
    return abs(_safe_float(tx.get("amountInAccountCurrency") or tx.get("amount")))

def _pluggy_fetch_transactions_for_account(pluggy_account_id: str) -> List[dict]:
    rows: List[dict] = []
    page = 1
    while page <= 20:
        payload = _pluggy_request(
            "GET",
            f"/transactions?accountId={pluggy_account_id}&pageSize=500&page={page}",
        )
        batch = payload.get("results") or payload.get("data") or []
        rows.extend(batch)
        total_pages = int(payload.get("totalPages") or 1)
        if page >= total_pages or not batch:
            break
        page += 1
    return rows

def _normalize_pluggy_account(account: dict) -> dict:
    acc_type = (account.get("type") or "BANK").upper()
    subtype = (account.get("subtype") or "").upper()
    is_credit = acc_type == "CREDIT" or "CREDIT" in subtype
    return {
        "pluggy_id": str(account.get("id") or ""),
        "id": f"{'card' if is_credit else 'acc'}-{account.get('id')}",
        "account_name": account.get("name") or ("Cartão" if is_credit else "Conta"),
        "account_type": "credit" if is_credit else (account.get("subtype") or "checking").lower(),
        "balance": _safe_float(account.get("balance")),
        "currency": account.get("currencyCode") or "BRL",
        "is_credit": is_credit,
        "credit_data": account.get("creditData") or {},
    }

def _normalize_pluggy_transaction(tx: dict, bank_account_id: str) -> dict:
    tx_type = _pluggy_tx_type(tx)
    abs_amount = _pluggy_tx_amount(tx)
    signed = abs_amount if tx_type == "income" else -abs_amount
    description = tx.get("description") or "Transação bancária"
    return {
        "id": f"plg-{tx.get('id')}",
        "description": description,
        "amount": signed,
        "tx_type": tx_type,
        "transaction_date": tx.get("date") or _now_iso(),
        "category": _classify_category(description, signed, tx_type),
        "bank_account_id": bank_account_id,
    }

_pluggy_api_key_cache: dict = {"token": None, "expires_at": 0.0}

def _pluggy_headers() -> dict:
    if not PLUGGY_CLIENT_ID or not PLUGGY_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Pluggy não configurado")

    now_ts = datetime.now(timezone.utc).timestamp()
    cached = _pluggy_api_key_cache.get("token")
    if cached and now_ts < float(_pluggy_api_key_cache.get("expires_at") or 0):
        return {"X-API-KEY": cached, "Content-Type": "application/json"}

    auth = requests.post(
        f"{PLUGGY_BASE_URL.rstrip('/')}/auth",
        json={"clientId": PLUGGY_CLIENT_ID, "clientSecret": PLUGGY_CLIENT_SECRET},
        timeout=45,
    )
    if auth.status_code >= 300:
        raise HTTPException(status_code=502, detail="Falha ao autenticar no provedor Open Finance")
    data = auth.json()
    token = data.get("apiKey") or data.get("accessToken")
    if not token:
        raise HTTPException(status_code=502, detail="Token do provedor Open Finance inválido")
    _pluggy_api_key_cache["token"] = token
    _pluggy_api_key_cache["expires_at"] = now_ts + 7000
    return {"X-API-KEY": token, "Content-Type": "application/json"}

def _pluggy_request(method: str, path: str, payload: Optional[dict] = None, timeout: int = 45) -> dict:
    headers = _pluggy_headers()
    url = f"{PLUGGY_BASE_URL.rstrip('/')}{path}"
    res = requests.request(method, url, headers=headers, json=payload, timeout=timeout)
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


def _pluggy_get_item(item_id: str) -> dict:
    return _pluggy_request("GET", f"/items/{item_id}")


def _validate_pluggy_item_for_user(item_id: str, user_id: str) -> dict:
    item = _pluggy_get_item(item_id)
    client_user = str(item.get("clientUserId") or item.get("client_user_id") or "").strip()
    if client_user and client_user != user_id:
        raise HTTPException(status_code=403, detail="Esta conexão bancária não pertence à sua conta")
    status = (item.get("status") or "").upper()
    if status == "LOGIN_ERROR":
        raise HTTPException(
            status_code=400,
            detail="Falha no login bancário. Tente conectar novamente.",
        )
    return item


def _wait_pluggy_item_ready(item_id: str, max_attempts: int = 12, delay_sec: float = 2.5) -> dict:
    last_item: dict = {}
    for attempt in range(max_attempts):
        item = _pluggy_get_item(item_id)
        last_item = item
        status = (item.get("status") or "").upper()
        exec_status = (item.get("executionStatus") or "").upper()
        if status in ("UPDATED", "OUTDATED"):
            return item
        if status == "LOGIN_ERROR":
            raise HTTPException(
                status_code=400,
                detail="Não foi possível autenticar no banco. Verifique suas credenciais e tente novamente.",
            )
        if status == "UPDATING" or "IN_PROGRESS" in exec_status:
            if attempt < max_attempts - 1:
                time.sleep(delay_sec)
                continue
        if attempt < max_attempts - 1:
            time.sleep(delay_sec)
    return last_item


def _find_connection_by_provider_item(user_id: str, provider_item_id: str) -> Optional[dict]:
    conn_res = supabase.table("bank_connections").select("*").eq("user_id", user_id).execute()
    for row in conn_res.data or []:
        stored = _decrypt_secret(row.get("provider_item_id")) or ""
        if stored == provider_item_id:
            return row
    return None

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
    tx_type = tx.get("tx_type") or _tx_type_from_amount(amount)
    abs_amount = abs(amount)
    description = tx.get("description") or "Transação bancária"
    date_str = tx.get("transaction_date") or _now_iso()
    category = tx.get("category") or _classify_category(description, amount, tx_type)
    account_id = tx.get("bank_account_id") or account_id

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
            "tx_type": "income",
            "transaction_date": (now - timedelta(days=2)).isoformat(),
            "category": "Salário",
        },
        {
            "id": f"tx-{base}-002",
            "description": "PIX enviado Supermercado",
            "amount": -289.30,
            "tx_type": "expense",
            "transaction_date": (now - timedelta(days=1)).isoformat(),
            "category": "Alimentação",
        },
        {
            "id": f"tx-{base}-003",
            "description": "Uber",
            "amount": -42.55,
            "tx_type": "expense",
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

            _validate_pluggy_item_for_user(provider_item_id, user_id)
            _wait_pluggy_item_ready(provider_item_id)

            account_payload = _pluggy_request("GET", f"/accounts?itemId={provider_item_id}")
            accounts_data = account_payload.get("results") or account_payload.get("data") or []
            parsed_accounts = [_normalize_pluggy_account(a) for a in accounts_data if a.get("id")]

            normalized_accounts = [
                {
                    "id": a["id"],
                    "account_name": a["account_name"],
                    "account_type": a["account_type"],
                    "balance": a["balance"],
                    "currency": a["currency"],
                }
                for a in parsed_accounts
                if not a["is_credit"]
            ]
            normalized_cards = [
                {
                    "id": a["id"],
                    "card_name": a["account_name"],
                    "card_brand": (a["credit_data"].get("brand") or "visa").lower(),
                    "limit_total": _safe_float(a["credit_data"].get("limit")),
                    "limit_available": _safe_float(a["credit_data"].get("availableLimit")),
                    "invoice_amount": _safe_float(a["credit_data"].get("usedLimit")),
                    "due_date": str(a["credit_data"].get("dueDay") or a["credit_data"].get("closeDay") or ""),
                }
                for a in parsed_accounts
                if a["is_credit"]
            ]
            normalized_txs: List[dict] = []
            for account in parsed_accounts:
                pluggy_id = account.get("pluggy_id")
                if not pluggy_id:
                    continue
                for raw_tx in _pluggy_fetch_transactions_for_account(pluggy_id):
                    normalized_txs.append(_normalize_pluggy_transaction(raw_tx, account["id"]))
        else:
            normalized_accounts = _mock_accounts_for_connection(connection)
            normalized_cards = _mock_cards_for_connection(connection)
            normalized_txs = _mock_transactions_for_connection(connection, normalized_accounts[0]["id"]) if normalized_accounts else []

        for account in normalized_accounts:
            _upsert_bank_account(connection["id"], account)
        for card in normalized_cards:
            _upsert_bank_card(connection["id"], card)
        default_account_id = normalized_accounts[0]["id"] if normalized_accounts else (
            normalized_cards[0]["id"] if normalized_cards else None
        )
        for tx in normalized_txs:
            _upsert_transaction_from_bank(
                user_id,
                tx.get("bank_account_id") or default_account_id,
                tx,
            )

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


@api_router.get("/ocr/status")
async def ocr_status():
    from ocr_vision import tesseract_available, _anthropic_client
    return {
        "tesseract": tesseract_available(),
        "llm_text": _anthropic_client() is not None,
    }


@api_router.get("/open-finance/ready")
async def open_finance_ready():
    tables_ok = True
    try:
        supabase.table("bank_connections").select("id").limit(1).execute()
    except Exception:
        tables_ok = False
    pluggy_ok = _open_finance_provider_ready()
    return {
        "ready": pluggy_ok and tables_ok and OPEN_FINANCE_PROVIDER == "pluggy",
        "pluggy_configured": pluggy_ok,
        "provider": OPEN_FINANCE_PROVIDER,
        "tables_ok": tables_ok,
    }

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
async def login(payload: UserLogin, request: Request):
    rl_key = f"{_client_ip(request)}:{payload.email.lower()}"
    _check_login_rate_limit(rl_key)

    response = supabase.table('users').select('*').eq('email', payload.email.lower()).execute()
    user = response.data[0] if response.data else None
    if not user or not verify_password(payload.password, user['password']):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    _clear_login_rate_limit(rl_key)
    token = create_token(user['id'])
    return AuthResponse(token=token, user=user_to_out(user))

@api_router.post("/auth/google", response_model=AuthResponse)
async def google_login(payload: GoogleLogin, request: Request):
    # O e-mail só é conhecido depois de validar o access_token (abaixo), então
    # aqui o limite é por IP — evita usar o endpoint para martelar o servidor
    # de auth do Supabase com tokens inválidos.
    _check_login_rate_limit(f"{_client_ip(request)}:google")

    # Nunca confiar em email/nome/id enviados pelo cliente: o access_token é
    # validado diretamente contra o servidor de auth do Supabase, e é de lá
    # que tiramos a identidade real do usuário. Isso evita que alguém forje
    # uma requisição para assumir a conta de outra pessoa (account takeover).
    try:
        auth_response = supabase.auth.get_user(payload.access_token)
    except Exception:
        auth_response = None
    google_user = auth_response.user if auth_response else None
    if not google_user or not google_user.email:
        raise HTTPException(status_code=401, detail="Token do Google inválido ou expirado")
    if not google_user.email_confirmed_at:
        raise HTTPException(status_code=401, detail="E-mail do Google não verificado")

    email = google_user.email.lower()
    google_id = google_user.id
    metadata = google_user.user_metadata or {}
    name = (metadata.get('full_name') or metadata.get('name') or email.split('@')[0]).strip()
    avatar_url = metadata.get('avatar_url') or metadata.get('picture')

    response = supabase.table('users').select('*').eq('email', email).execute()
    user = response.data[0] if response.data else None

    if user:
        # Usuário já existe — atualiza google_id e avatar se necessário
        update_data: dict = {}
        if not user.get('google_id'):
            update_data['google_id'] = google_id
        if avatar_url and not user.get('avatar_url'):
            update_data['avatar_url'] = avatar_url
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            res = supabase.table('users').update(update_data).eq('id', user['id']).execute()
            user = res.data[0] if res.data else user
    else:
        # Cria novo usuário via Google
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "name": name,
            "email": email,
            "password": hash_password(secrets.token_hex(32)),  # senha aleatória, não usada
            "google_id": google_id,
            "avatar_url": avatar_url,
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
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
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
def _notification_fingerprint(payload: NotificationTransactionIn) -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    seed = f"{payload.bank or ''}|{payload.amount:.2f}|{payload.type}|{payload.description}|{today}"
    return hashlib.sha256(seed.encode()).hexdigest()[:24]

def _guess_category_from_text(text: str, tx_type: str) -> str:
    signed = 1.0 if tx_type == "income" else -1.0
    return _classify_category(text, signed, tx_type)

@api_router.post("/transactions", response_model=TransactionOut)
async def create_transaction(payload: TransactionCreate, current=Depends(get_current_user)):
    tx_id = str(uuid.uuid4())
    doc = {
        "id": tx_id,
        "user_id": current['id'],
        "type": payload.type,
        "amount": abs(float(payload.amount)),
        "category": payload.category,
        "description": payload.description,
        "date": (payload.date or datetime.now(timezone.utc)).isoformat(),
        "card_id": payload.card_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table('transactions').insert(doc).execute()
    return TransactionOut(**doc)

@api_router.post("/transactions/from-notification", response_model=TransactionOut)
async def create_transaction_from_notification(payload: NotificationTransactionIn, current=Depends(get_current_user)):
    link_id = f"notif-{_notification_fingerprint(payload)}"
    existing = supabase.table("bank_transaction_links").select("transaction_id").eq("id", link_id).eq("user_id", current["id"]).execute()
    if existing.data:
        tx_res = supabase.table("transactions").select("*").eq("id", existing.data[0]["transaction_id"]).eq("user_id", current["id"]).execute()
        if tx_res.data:
            return TransactionOut(**tx_res.data[0])

    text = f"{payload.description} {payload.raw or ''}".strip()
    category = _guess_category_from_text(text, payload.type)
    bank_label = payload.bank or "Banco"
    description = payload.description.strip() or f"PIX {bank_label}"
    tx_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": tx_id,
        "user_id": current["id"],
        "type": payload.type,
        "amount": abs(float(payload.amount)),
        "category": category,
        "description": description,
        "date": now.isoformat(),
        "card_id": None,
        "created_at": now.isoformat(),
    }
    supabase.table("transactions").insert(doc).execute()
    try:
        supabase.table("bank_transaction_links").insert({
            "id": link_id,
            "transaction_id": tx_id,
            "user_id": current["id"],
            "bank_account_id": None,
            "created_at": now.isoformat(),
        }).execute()
    except Exception:
        pass
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
    items = response.data or []

    # compute used from card transactions
    for it in items:
        tx_response = supabase.table('transactions').select('amount').eq('user_id', current['id']).eq('card_id', it['id']).eq('type', 'expense').execute()
        it['used'] = sum(float(tx['amount']) for tx in tx_response.data) if tx_response.data else 0.0

    conn_res = supabase.table("bank_connections").select("id").eq("user_id", current["id"]).execute()
    conn_ids = [c["id"] for c in (conn_res.data or [])]
    if conn_ids:
        bank_cards_res = supabase.table("bank_cards").select("*").in_("connection_id", conn_ids).execute()
        for bc in (bank_cards_res.data or []):
            items.append({
                "id": bc["id"],
                "user_id": current["id"],
                "name": bc.get("card_name") or "Cartão conectado",
                "last_digits": "0000",
                "brand": (bc.get("card_brand") or "visa").title(),
                "card_limit": _safe_float(bc.get("limit_total")),
                "closing_day": int(_safe_float(bc.get("due_date")) or 5),
                "due_day": int(_safe_float(bc.get("due_date")) or 15),
                "color": "#3B82F6",
                "used": _safe_float(bc.get("invoice_amount")),
                "created_at": bc.get("created_at") or _now_iso(),
            })

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

    # Sempre amarra o token ao usuário autenticado (não confia no body do app)
    client_user_id = current["id"].strip()
    if payload.client_user_id and payload.client_user_id.strip() != client_user_id:
        raise HTTPException(status_code=403, detail="client_user_id não corresponde ao usuário autenticado")

    raw = _create_pluggy_connect_token(client_user_id)
    access_token = raw.get("accessToken") or raw.get("access_token") or raw.get("token")
    if not access_token:
        raise HTTPException(status_code=502, detail="Pluggy não retornou o token de conexão")
    return {"accessToken": access_token}

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
                last_error=conn.get("last_error"),
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
    provider_item_id_enc = ""
    plain_item_id = ""
    if OPEN_FINANCE_PROVIDER == "pluggy":
        if not (PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET):
            raise HTTPException(status_code=503, detail="Pluggy não configurado no backend")
        plain_item_id = (payload.provider_item_id or "").strip()
        if not plain_item_id:
            raise HTTPException(
                status_code=400,
                detail="Conexão real exige provider_item_id do Pluggy (itemId)"
            )
        _validate_pluggy_item_for_user(plain_item_id, current["id"])
        _wait_pluggy_item_ready(plain_item_id)
        provider_item_id_enc = _encrypt_secret(plain_item_id)

    existing = _find_connection_by_provider_item(current["id"], plain_item_id) if plain_item_id else None
    if existing:
        conn_id = existing["id"]
        supabase.table("bank_connections").update({
            "institution_id": payload.institution_id,
            "institution_name": institution_name,
            "status": "syncing",
            "last_error": None,
            "updated_at": now,
        }).eq("id", conn_id).execute()
        row = {**existing, "institution_id": payload.institution_id, "institution_name": institution_name, "status": "syncing"}
    else:
        conn_id = str(uuid.uuid4())
        row = {
            "id": conn_id,
            "user_id": current["id"],
            "institution_id": payload.institution_id,
            "institution_name": institution_name,
            "status": "syncing",
            "provider": OPEN_FINANCE_PROVIDER,
            "provider_item_id": provider_item_id_enc,
            "last_sync": None,
            "last_error": None,
            "created_at": now,
            "updated_at": now,
        }
        supabase.table("bank_connections").insert(row).execute()

    try:
        _sync_open_finance_connection(row, current["id"])
    except HTTPException:
        pass

    listed = await list_open_finance_connections(current)
    found = next((x for x in listed if x.connection.id == conn_id), None)
    if not found:
        raise HTTPException(status_code=500, detail="Conexão criada, mas não foi possível carregar dados")
    if found.connection.status == "error":
        raise HTTPException(
            status_code=502,
            detail=found.connection.last_error or "Banco conectado, mas a sincronização falhou. Toque em Sync para tentar de novo.",
        )
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
    results = []
    for conn in rows:
        try:
            _sync_open_finance_connection(conn, current["id"])
            results.append({"id": conn["id"], "ok": True})
        except Exception as e:
            detail = e.detail if isinstance(e, HTTPException) else str(e)
            results.append({"id": conn["id"], "ok": False, "error": detail})
    return {"ok": True, "connections": len(rows), "results": results}

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
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
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

# ---------- DOCUMENT OCR / SCAN ----------

SCANNED_STORAGE_PREFIX = "scanned_docs"
_scanned_table_ok: Optional[bool] = None


def _migrate_scanned_documents_table() -> bool:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return False
    try:
        import psycopg2
        sql_path = ROOT_DIR / "supabase_scanned_documents.sql"
        sql = sql_path.read_text(encoding="utf-8")
        statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
        conn = psycopg2.connect(url)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                for stmt in statements:
                    cur.execute(stmt)
        finally:
            conn.close()
        logging.info("scanned_documents table migration applied")
        return True
    except Exception as exc:
        logging.warning("scanned_documents migration skipped: %s", exc)
        return False


def _scanned_documents_table_available() -> bool:
    global _scanned_table_ok
    if _scanned_table_ok is not None:
        return _scanned_table_ok
    try:
        supabase.table("scanned_documents").select("id").limit(1).execute()
        _scanned_table_ok = True
    except Exception:
        _scanned_table_ok = False
    return _scanned_table_ok


def _save_scanned_document_storage(scan_doc: dict) -> None:
    user_id = scan_doc["user_id"]
    scan_id = scan_doc["id"]
    path = f"{SCANNED_STORAGE_PREFIX}/{user_id}/{scan_id}.json"
    supabase.storage.from_("avatars").upload(
        path,
        json.dumps(scan_doc, ensure_ascii=False).encode("utf-8"),
        file_options={"content-type": "application/json", "upsert": "true"},
    )


def _list_scanned_documents_storage(user_id: str) -> List[dict]:
    try:
        items = supabase.storage.from_("avatars").list(f"{SCANNED_STORAGE_PREFIX}/{user_id}")
    except Exception:
        return []
    docs: List[dict] = []
    for item in items or []:
        name = item.get("name") or ""
        if not name.endswith(".json"):
            continue
        path = f"{SCANNED_STORAGE_PREFIX}/{user_id}/{name}"
        try:
            raw = supabase.storage.from_("avatars").download(path)
            docs.append(json.loads(raw.decode("utf-8")))
        except Exception:
            continue
    docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return docs[:100]


@api_router.post("/documents/parse")
async def parse_document_ocr(payload: DocumentOcrParseIn, current=Depends(get_current_user)):
    if not (payload.ocr_text or "").strip():
        raise HTTPException(status_code=400, detail="Texto OCR vazio. Tente outra foto com boa iluminação.")
    return _parse_ocr_text(payload.ocr_text)

def _ocr_image_bytes(content: bytes) -> dict:
    result = _extract_from_image(content)
    logging.info(
        "OCR result source=%s est=%s amount=%s ocr_len=%d",
        result.get("source"),
        (result.get("establishment") or "")[:40],
        result.get("amount"),
        len(result.get("ocr_text") or ""),
    )
    return result


@api_router.post("/documents/ocr-upload")
async def ocr_document_upload(file: UploadFile = File(...), current=Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = (file.content_type or "image/jpeg").lower()
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use JPG, PNG ou WEBP.")
    content = await file.read()
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="Imagem inválida ou vazia.")
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx. 8MB).")
    logging.info("OCR upload user=%s bytes=%d", current["id"], len(content))
    return await asyncio.to_thread(_ocr_image_bytes, content)


@api_router.post("/documents/ocr-base64")
async def ocr_document_base64(payload: DocumentOcrBase64In, current=Depends(get_current_user)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = (payload.content_type or "image/jpeg").lower()
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use JPG, PNG ou WEBP.")
    raw = (payload.image_base64 or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Imagem não enviada.")
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        content = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagem inválida ou corrompida.")
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="Imagem inválida ou corrompida.")
    logging.info("OCR base64 user=%s bytes=%d", current["id"], len(content))
    return await asyncio.to_thread(_ocr_image_bytes, content)

@api_router.post("/documents/confirm", response_model=ScannedDocumentOut)
async def confirm_scanned_document(payload: DocumentScanConfirmIn, current=Depends(get_current_user)):
    if not payload.establishment.strip():
        raise HTTPException(status_code=400, detail="Informe o estabelecimento")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Informe um valor válido")

    now = datetime.now(timezone.utc)
    tx_id = str(uuid.uuid4())
    tx_date = payload.transaction_date.isoformat() if payload.transaction_date else now.isoformat()

    tx_doc = {
        "id": tx_id,
        "user_id": current["id"],
        "type": payload.type,
        "amount": abs(float(payload.amount)),
        "category": payload.category.strip() or "Compras",
        "description": payload.establishment.strip(),
        "date": tx_date,
        "card_id": None,
        "created_at": now.isoformat(),
    }
    try:
        supabase.table("transactions").insert(tx_doc).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar transação: {exc}")

    scan_id = str(uuid.uuid4())
    scan_doc = {
        "id": scan_id,
        "user_id": current["id"],
        "establishment": payload.establishment.strip(),
        "amount": abs(float(payload.amount)),
        "category": payload.category.strip() or "Compras",
        "transaction_date": tx_date,
        "ocr_text": payload.ocr_text,
        "transaction_id": tx_id,
        "created_at": now.isoformat(),
    }
    if _scanned_documents_table_available():
        try:
            supabase.table("scanned_documents").insert(scan_doc).execute()
        except Exception as exc:
            logging.warning("scanned_documents insert failed, using storage: %s", exc)
            global _scanned_table_ok
            _scanned_table_ok = False
            _save_scanned_document_storage(scan_doc)
    else:
        try:
            _save_scanned_document_storage(scan_doc)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Erro ao salvar documento escaneado: {exc}")
    return ScannedDocumentOut(**scan_doc)

@api_router.get("/documents/scanned", response_model=List[ScannedDocumentOut])
async def list_scanned_documents(current=Depends(get_current_user)):
    if _scanned_documents_table_available():
        try:
            res = (
                supabase.table("scanned_documents")
                .select("*")
                .eq("user_id", current["id"])
                .order("created_at", desc=True)
                .limit(100)
                .execute()
            )
            return [ScannedDocumentOut(**row) for row in (res.data or [])]
        except Exception:
            global _scanned_table_ok
            _scanned_table_ok = False
    rows = _list_scanned_documents_storage(current["id"])
    return [ScannedDocumentOut(**row) for row in rows]

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
# A autenticação da API é feita via Bearer token no header Authorization
# (não usa cookies de sessão), então allow_credentials não precisa ser True.
# Wildcard de origem + credentials=True é uma combinação inválida/insegura
# (a maioria dos navegadores rejeita) — por isso allow_credentials=False aqui.
# Se quiser restringir quem pode chamar a API a partir de um navegador,
# defina CORS_ORIGINS (separado por vírgula) no .env.
_cors_origins_env = os.environ.get('CORS_ORIGINS', '').strip()
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(',') if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
async def _on_startup():
    if JWT_SECRET == 'change-me':
        logging.warning(
            "=" * 70 + "\n"
            "AVISO DE SEGURANÇA: JWT_SECRET não foi configurado (usando valor "
            "padrão inseguro 'change-me'). Qualquer pessoa pode forjar tokens "
            "de login válidos para qualquer usuário. Defina JWT_SECRET no "
            "arquivo backend/.env antes de usar em produção.\n" + "=" * 70
        )
    if _migrate_scanned_documents_table():
        global _scanned_table_ok
        _scanned_table_ok = True
    try:
        from ocr_vision import warmup_ocr
        warmup_ocr()
    except Exception as exc:
        logging.warning("OCR startup check falhou: %s", exc)


@app.get("/")
async def root_health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)