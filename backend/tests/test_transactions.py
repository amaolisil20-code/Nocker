def _create_transaction(client, headers, **overrides):
    payload = {
        "type": "expense",
        "amount": 50.0,
        "category": "Mercado",
        "description": "Compras da semana",
        **overrides,
    }
    return client.post("/api/transactions", json=payload, headers=headers)


def test_create_transaction_requires_auth(client, fake_db):
    res = _create_transaction(client, headers={})
    assert res.status_code in (401, 403)


def test_create_and_list_transaction(client, register_user):
    _, _, headers = register_user(email="tx@example.com")

    created = _create_transaction(client, headers)
    assert created.status_code == 200
    body = created.json()
    assert body["amount"] == 50.0
    assert body["category"] == "Mercado"
    assert body["type"] == "expense"

    listed = client.get("/api/transactions", headers=headers)
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["id"] == body["id"]


def test_transactions_are_isolated_per_user(client, register_user):
    _, _, headers_a = register_user(email="a@example.com")
    _, _, headers_b = register_user(email="b@example.com")

    _create_transaction(client, headers_a, description="Da Amanda")
    _create_transaction(client, headers_b, description="Do outro usuário")

    listed_a = client.get("/api/transactions", headers=headers_a).json()
    assert len(listed_a) == 1
    assert listed_a[0]["description"] == "Da Amanda"


def test_update_transaction(client, register_user):
    _, _, headers = register_user(email="update@example.com")
    created = _create_transaction(client, headers).json()

    res = client.patch(f"/api/transactions/{created['id']}", json={"amount": 99.9}, headers=headers)
    assert res.status_code == 200
    assert res.json()["amount"] == 99.9


def test_update_transaction_belonging_to_another_user_is_not_found(client, register_user):
    _, _, headers_a = register_user(email="owner@example.com")
    _, _, headers_b = register_user(email="intruder@example.com")
    created = _create_transaction(client, headers_a).json()

    res = client.patch(f"/api/transactions/{created['id']}", json={"amount": 1.0}, headers=headers_b)
    assert res.status_code == 404


def test_delete_transaction(client, register_user):
    _, _, headers = register_user(email="delete@example.com")
    created = _create_transaction(client, headers).json()

    res = client.delete(f"/api/transactions/{created['id']}", headers=headers)
    assert res.status_code == 200

    listed = client.get("/api/transactions", headers=headers).json()
    assert listed == []


def test_delete_nonexistent_transaction_returns_404(client, register_user):
    _, _, headers = register_user(email="delete2@example.com")
    res = client.delete("/api/transactions/id-que-nao-existe", headers=headers)
    assert res.status_code == 404
