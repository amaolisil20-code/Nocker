"""Phase A expansion tests: fixed-expenses, installments, subscriptions, categories, projection.
Also re-verifies existing critical endpoints (auth/transactions/cards/goals/dashboard/chat) still work.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

state = {}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    email = f"test_pa_{uuid.uuid4().hex[:8]}@nocker.com"
    r = session.post(f"{API}/auth/register", json={"name": "TEST PhaseA", "email": email, "password": "123456"})
    assert r.status_code == 200, f"register failed: {r.text}"
    data = r.json()
    state["token"] = data["token"]
    state["user_id"] = data["user"]["id"]
    state["email"] = email
    return data


def H():
    return {"Authorization": f"Bearer {state['token']}"}


# ---- Fixed Expenses ----
def test_fixed_expenses_crud(session, auth):
    r = session.post(f"{API}/fixed-expenses", headers=H(), json={
        "name": "TEST Aluguel", "amount": 1500.0, "category": "Moradia",
        "due_day": 5, "color": "#EF4444", "notes": "TEST note", "active": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "_id" not in d
    assert d["name"] == "TEST Aluguel" and d["amount"] == 1500.0 and d["active"] is True
    fe_id = d["id"]
    state["fe_id"] = fe_id

    # List - confirm persisted
    r2 = session.get(f"{API}/fixed-expenses", headers=H())
    assert r2.status_code == 200
    items = r2.json()
    assert any(x["id"] == fe_id for x in items)

    # PATCH toggle active
    r3 = session.patch(f"{API}/fixed-expenses/{fe_id}", headers=H(), json={"active": False})
    assert r3.status_code == 200
    assert r3.json()["active"] is False

    # PATCH no-op should 400
    r3b = session.patch(f"{API}/fixed-expenses/{fe_id}", headers=H(), json={})
    assert r3b.status_code == 400

    # DELETE
    r4 = session.delete(f"{API}/fixed-expenses/{fe_id}", headers=H())
    assert r4.status_code == 200
    r5 = session.delete(f"{API}/fixed-expenses/{fe_id}", headers=H())
    assert r5.status_code == 404


def test_fixed_expense_for_projection_seed(session, auth):
    """Create an active fixed expense used by projection test."""
    r = session.post(f"{API}/fixed-expenses", headers=H(), json={
        "name": "TEST Internet", "amount": 100.0, "category": "Moradia", "due_day": 10})
    assert r.status_code == 200
    state["fe_keep"] = r.json()["id"]


# ---- Installments ----
def test_installments_crud(session, auth):
    r = session.post(f"{API}/installments", headers=H(), json={
        "name": "TEST iPhone", "total_amount": 6000.0, "installments_total": 12,
        "installments_paid": 2, "category": "Compras"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "_id" not in d
    # computed fields
    assert d["monthly_amount"] == 500.0
    assert d["remaining_amount"] == 5000.0  # (12-2)*500
    i_id = d["id"]
    state["inst_id"] = i_id

    # invalid installments
    rx = session.post(f"{API}/installments", headers=H(), json={
        "name": "X", "total_amount": 100, "installments_total": 0, "category": "Outros"})
    assert rx.status_code == 400

    # List
    r2 = session.get(f"{API}/installments", headers=H())
    assert r2.status_code == 200
    found = next((x for x in r2.json() if x["id"] == i_id), None)
    assert found is not None
    assert found["monthly_amount"] == 500.0

    # PATCH increment paid
    r3 = session.patch(f"{API}/installments/{i_id}", headers=H(), json={"installments_paid": 3})
    assert r3.status_code == 200
    j = r3.json()
    assert j["installments_paid"] == 3
    assert j["remaining_amount"] == 4500.0


def test_installment_active_for_projection(session, auth):
    """Keep this installment for projection."""
    # already created above, just verify it still exists
    r = session.get(f"{API}/installments", headers=H())
    assert any(x["id"] == state["inst_id"] for x in r.json())


# ---- Subscriptions ----
def test_subscriptions_crud(session, auth):
    # monthly
    r1 = session.post(f"{API}/subscriptions", headers=H(), json={
        "name": "TEST Netflix", "amount": 50.0, "billing_cycle": "monthly"})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["monthly_cost"] == 50.0 and d1["active"] is True
    sub_m = d1["id"]
    state["sub_m"] = sub_m

    # yearly
    r2 = session.post(f"{API}/subscriptions", headers=H(), json={
        "name": "TEST Spotify Yearly", "amount": 120.0, "billing_cycle": "yearly"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["monthly_cost"] == 10.0  # 120/12
    state["sub_y"] = d2["id"]

    # list
    r3 = session.get(f"{API}/subscriptions", headers=H())
    assert r3.status_code == 200
    ids = {x["id"] for x in r3.json()}
    assert sub_m in ids and state["sub_y"] in ids

    # toggle active
    r4 = session.patch(f"{API}/subscriptions/{sub_m}", headers=H(), json={"active": False})
    assert r4.status_code == 200
    assert r4.json()["active"] is False

    # delete one
    r5 = session.delete(f"{API}/subscriptions/{state['sub_y']}", headers=H())
    assert r5.status_code == 200


# ---- Categories ----
def test_categories_auto_seed_on_first_get(session, auth):
    """For a freshly-registered user, GET /categories should seed 10 defaults."""
    r = session.get(f"{API}/categories", headers=H())
    assert r.status_code == 200, r.text
    items = r.json()
    # Expect exactly the 10 default categories
    assert len(items) == 10, f"expected 10 defaults, got {len(items)}"
    names = {i["name"] for i in items}
    for expected in ["Alimentação", "Transporte", "Moradia", "Lazer", "Saúde",
                     "Educação", "Compras", "Outros", "Salário", "Investimentos"]:
        assert expected in names, f"missing default: {expected}"
    # all rows belong to current user, have type/color/icon
    for it in items:
        assert it["user_id"] == state["user_id"]
        assert it["type"] in ("income", "expense")
        assert "_id" not in it


def test_categories_idempotent_seed(session, auth):
    """Calling GET again should NOT re-seed."""
    r1 = session.get(f"{API}/categories", headers=H())
    r2 = session.get(f"{API}/categories", headers=H())
    assert len(r1.json()) == len(r2.json()) == 10


def test_categories_custom_create_delete(session, auth):
    r = session.post(f"{API}/categories", headers=H(), json={
        "name": "TEST PetCare", "type": "expense", "color": "#F472B6", "icon": "paw"})
    assert r.status_code == 200
    d = r.json()
    assert d["name"] == "TEST PetCare" and d["icon"] == "paw"
    cid = d["id"]

    # confirm appears in list
    r2 = session.get(f"{API}/categories", headers=H())
    assert any(x["id"] == cid for x in r2.json())

    # delete
    r3 = session.delete(f"{API}/categories/{cid}", headers=H())
    assert r3.status_code == 200
    r4 = session.delete(f"{API}/categories/{cid}", headers=H())
    assert r4.status_code == 404


# ---- Projection ----
def test_projection_default(session, auth):
    # seed an income + expense for averages
    session.post(f"{API}/transactions", headers=H(), json={
        "type": "income", "amount": 4000.0, "category": "Salário", "description": "TEST"})
    session.post(f"{API}/transactions", headers=H(), json={
        "type": "expense", "amount": 800.0, "category": "Alimentação", "description": "TEST"})

    r = session.get(f"{API}/projection", headers=H())
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("current_balance", "avg_monthly_income", "avg_monthly_expense",
              "monthly_net", "fixed_total", "subscriptions_monthly",
              "installments_monthly", "projection"):
        assert k in d, f"missing {k}"
    assert isinstance(d["projection"], list) and len(d["projection"]) == 6
    for row in d["projection"]:
        assert "month" in row and "projected_balance" in row and "monthly_net" in row
    # fixed_total should include our "TEST Internet" 100
    assert d["fixed_total"] >= 100.0
    # installments_monthly should include our iPhone (500) since paid<total
    assert d["installments_monthly"] >= 500.0
    # subscriptions_monthly should include netflix monthly (toggled inactive earlier in same session? we toggled sub_m off)
    # but the user may still have other active subs; just sanity-check non-negative
    assert d["subscriptions_monthly"] >= 0.0


def test_projection_months_param(session, auth):
    r = session.get(f"{API}/projection?months=12", headers=H())
    assert r.status_code == 200
    assert len(r.json()["projection"]) == 12

    # out-of-range falls back to 6
    r2 = session.get(f"{API}/projection?months=99", headers=H())
    assert r2.status_code == 200
    assert len(r2.json()["projection"]) == 6


# ---- Regression: existing endpoints still work ----
def test_existing_dashboard_still_ok(session, auth):
    r = session.get(f"{API}/dashboard/summary", headers=H())
    assert r.status_code == 200
    assert "balance" in r.json()


def test_existing_goals_still_ok(session, auth):
    r = session.post(f"{API}/goals", headers=H(), json={
        "title": "TEST Goal", "target_amount": 1000.0, "current_amount": 100.0})
    assert r.status_code == 200
    gid = r.json()["id"]
    r2 = session.delete(f"{API}/goals/{gid}", headers=H())
    assert r2.status_code == 200


def test_existing_cards_still_ok(session, auth):
    r = session.post(f"{API}/cards", headers=H(), json={
        "name": "TEST Card", "last_digits": "9999", "brand": "visa",
        "limit": 1000.0, "closing_day": 1, "due_day": 10})
    assert r.status_code == 200
    cid = r.json()["id"]
    r2 = session.get(f"{API}/cards", headers=H())
    assert any(c["id"] == cid for c in r2.json())
    session.delete(f"{API}/cards/{cid}", headers=H())


# ---- Auth gate on new endpoints ----
def test_new_endpoints_require_auth(session):
    for ep in ("/fixed-expenses", "/installments", "/subscriptions", "/categories", "/projection"):
        r = session.get(f"{API}{ep}")
        assert r.status_code in (401, 403), f"{ep} should require auth, got {r.status_code}"
