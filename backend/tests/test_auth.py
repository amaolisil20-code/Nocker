def test_register_creates_user_and_returns_token(client):
    res = client.post("/api/auth/register", json={
        "name": "Amanda Teste", "email": "amanda@example.com", "password": "senha123",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "amanda@example.com"
    assert body["user"]["name"] == "Amanda Teste"
    assert body["token"]


def test_register_duplicate_email_is_rejected(client, register_user):
    register_user(email="dup@example.com")
    res = client.post("/api/auth/register", json={
        "name": "Outra Pessoa", "email": "dup@example.com", "password": "outrasenha",
    })
    assert res.status_code == 400


def test_login_with_correct_password_succeeds(client, register_user):
    register_user(email="login@example.com", password="senha123")
    res = client.post("/api/auth/login", json={"email": "login@example.com", "password": "senha123"})
    assert res.status_code == 200
    assert res.json()["token"]


def test_login_with_wrong_password_is_rejected(client, register_user):
    register_user(email="login2@example.com", password="senha123")
    res = client.post("/api/auth/login", json={"email": "login2@example.com", "password": "senha-errada"})
    assert res.status_code == 401


def test_login_with_unknown_email_is_rejected(client):
    res = client.post("/api/auth/login", json={"email": "ninguem@example.com", "password": "x"})
    assert res.status_code == 401


def test_login_is_rate_limited_after_five_failed_attempts(client, register_user):
    register_user(email="brute@example.com", password="senha-correta")

    for _ in range(5):
        res = client.post("/api/auth/login", json={"email": "brute@example.com", "password": "errada"})
        assert res.status_code == 401

    blocked = client.post("/api/auth/login", json={"email": "brute@example.com", "password": "errada"})
    assert blocked.status_code == 429

    # mesmo a senha certa deve ser bloqueada enquanto o limite estiver ativo
    still_blocked = client.post("/api/auth/login", json={"email": "brute@example.com", "password": "senha-correta"})
    assert still_blocked.status_code == 429


def test_successful_login_clears_the_rate_limit_counter(client, register_user):
    register_user(email="ok@example.com", password="senha-correta")

    for _ in range(3):
        res = client.post("/api/auth/login", json={"email": "ok@example.com", "password": "errada"})
        assert res.status_code == 401

    ok = client.post("/api/auth/login", json={"email": "ok@example.com", "password": "senha-correta"})
    assert ok.status_code == 200

    # o contador deve ter zerado após o sucesso: mais tentativas erradas
    # devem levar 5 chamadas (e não já estar quase no limite) para bloquear
    for _ in range(4):
        res = client.post("/api/auth/login", json={"email": "ok@example.com", "password": "errada"})
        assert res.status_code == 401
    still_ok_to_try = client.post("/api/auth/login", json={"email": "ok@example.com", "password": "errada"})
    assert still_ok_to_try.status_code == 401  # 5ª tentativa após o reset, ainda não bloqueado


def test_google_login_rejects_invalid_token(client, fake_db):
    res = client.post("/api/auth/google", json={"access_token": "token-forjado"})
    assert res.status_code == 401


def test_google_login_ignores_client_supplied_identity_and_uses_verified_token(client, fake_db):
    """Regressão da falha de account takeover: mesmo que o corpo da
    requisição não tenha mais campos de identidade, garante que o backend
    usa email/nome extraídos do token validado, não de nada vindo do cliente."""
    fake_db.auth.set_user(
        "token-valido",
        id="google-sub-123",
        email="real@example.com",
        user_metadata={"full_name": "Usuário Real", "avatar_url": "https://img/avatar.png"},
    )
    res = client.post("/api/auth/google", json={"access_token": "token-valido"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "real@example.com"
    assert body["user"]["name"] == "Usuário Real"


def test_google_login_rejects_unverified_email(client, fake_db):
    fake_db.auth.set_user(
        "token-nao-verificado",
        id="google-sub-999",
        email="naoverificado@example.com",
        email_confirmed_at=None,
    )
    res = client.post("/api/auth/google", json={"access_token": "token-nao-verificado"})
    assert res.status_code == 401


def test_me_requires_a_valid_token(client, register_user):
    _, _, headers = register_user(email="me@example.com")
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == "me@example.com"

    res_no_auth = client.get("/api/auth/me")
    assert res_no_auth.status_code in (401, 403)
