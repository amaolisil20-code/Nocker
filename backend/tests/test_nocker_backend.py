"""Nocker backend API tests — auth, transactions, cards, goals, dashboard, chat."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://cb8df091-1d9b-4473-9be5-ad72bf9be5f9.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Shared state across tests
state = {}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    """Register a fresh user and return token + user."""
    email = f"test_{uuid.uuid4().hex[:8]}@nocker.com"
    r = session.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "password": "123456"})
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == email.lower()
    state["email"] = email
    state["token"] = data["token"]
    state["user_id"] = data["user"]["id"]
    return data


# ---- Health ----
def test_health(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---- Auth ----
def test_register_and_me(session, auth):
    headers = {"Authorization": f"Bearer {auth['token']}"}
    r = session.get(f"{API}/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == auth["user"]["email"]


def test_login_existing_seed(session):
    r = session.post(f"{API}/auth/login", json={"email": "teste@nocker.com", "password": "123456"})
    # may not be seeded; accept 200 or 401
    assert r.status_code in (200, 401)


def test_login_wrong_password(session, auth):
    r = session.post(f"{API}/auth/login", json={"email": state["email"], "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code in (401, 403)


# ---- Transactions ----
def test_create_income_and_expense(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r1 = session.post(f"{API}/transactions", headers=h, json={
        "type": "income", "amount": 5000.0, "category": "Salário", "description": "TEST salario"})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "_id" not in d1
    assert d1["type"] == "income" and d1["amount"] == 5000.0
    state["tx_income"] = d1["id"]

    r2 = session.post(f"{API}/transactions", headers=h, json={
        "type": "expense", "amount": 150.5, "category": "Alimentação", "description": "TEST mercado"})
    assert r2.status_code == 200
    state["tx_expense"] = r2.json()["id"]


def test_list_transactions(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.get(f"{API}/transactions", headers=h)
    assert r.status_code == 200
    items = r.json()
    ids = [i["id"] for i in items]
    assert state["tx_income"] in ids and state["tx_expense"] in ids
    for it in items:
        assert "_id" not in it


def test_delete_transaction(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.delete(f"{API}/transactions/{state['tx_expense']}", headers=h)
    assert r.status_code == 200
    # verify gone
    r2 = session.get(f"{API}/transactions", headers=h)
    ids = [i["id"] for i in r2.json()]
    assert state["tx_expense"] not in ids


# ---- Cards ----
def test_create_and_list_card(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.post(f"{API}/cards", headers=h, json={
        "name": "TEST Nubank", "last_digits": "12345678", "brand": "mastercard",
        "limit": 3000.0, "closing_day": 5, "due_day": 12, "color": "#16A34A"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "_id" not in d
    assert d["last_digits"] == "5678"  # truncated to last 4
    assert d["used"] == 0.0
    state["card_id"] = d["id"]

    # Add an expense with this card to test 'used' computation
    session.post(f"{API}/transactions", headers=h, json={
        "type": "expense", "amount": 200.0, "category": "Compras", "description": "TEST card",
        "card_id": state["card_id"]})

    r2 = session.get(f"{API}/cards", headers=h)
    assert r2.status_code == 200
    card = next((c for c in r2.json() if c["id"] == state["card_id"]), None)
    assert card is not None
    assert card["used"] == 200.0


def test_delete_card(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.delete(f"{API}/cards/{state['card_id']}", headers=h)
    assert r.status_code == 200


# ---- Goals ----
def test_goal_crud(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.post(f"{API}/goals", headers=h, json={
        "title": "TEST Viagem", "target_amount": 10000.0, "current_amount": 1000.0})
    assert r.status_code == 200
    g = r.json()
    assert "_id" not in g
    gid = g["id"]

    r2 = session.patch(f"{API}/goals/{gid}", headers=h, json={"current_amount": 2500.0})
    assert r2.status_code == 200
    assert r2.json()["current_amount"] == 2500.0

    r3 = session.get(f"{API}/goals", headers=h)
    assert r3.status_code == 200
    assert any(x["id"] == gid and x["current_amount"] == 2500.0 for x in r3.json())

    r4 = session.delete(f"{API}/goals/{gid}", headers=h)
    assert r4.status_code == 200


# ---- Dashboard ----
def test_dashboard_summary(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.get(f"{API}/dashboard/summary", headers=h)
    assert r.status_code == 200
    d = r.json()
    for k in ("balance", "total_income", "total_expense", "month_income",
              "month_expense", "month_savings", "categories", "evolution",
              "recent", "cards_count", "goals_count"):
        assert k in d, f"missing key {k}"
    assert isinstance(d["evolution"], list) and len(d["evolution"]) == 6
    assert isinstance(d["categories"], list)
    assert isinstance(d["recent"], list)
    for tx in d["recent"]:
        assert "_id" not in tx


# ---- Chat (Claude via emergentintegrations) ----
def test_chat_nocker_ia(session, auth):
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.post(f"{API}/chat", headers=h, json={"message": "Oi, me dê 1 dica curta de economia."}, timeout=60)
    assert r.status_code == 200, f"chat failed: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("session_id")
    assert d.get("reply") and len(d["reply"]) > 0
    state["session_id"] = d["session_id"]


def test_chat_history(session, auth):
    if "session_id" not in state:
        pytest.skip("no session")
    h = {"Authorization": f"Bearer {auth['token']}"}
    r = session.get(f"{API}/chat/history/{state['session_id']}", headers=h)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2
    roles = [i["role"] for i in items]
    assert "user" in roles and "assistant" in roles
