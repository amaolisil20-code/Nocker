import pytest
from fastapi.testclient import TestClient

import server
from tests.fake_supabase import FakeSupabase


@pytest.fixture
def fake_db(monkeypatch):
    """Troca server.supabase por um banco falso em memória, isolado por teste."""
    fake = FakeSupabase()
    monkeypatch.setattr(server, "supabase", fake)
    return fake


@pytest.fixture(autouse=True)
def _reset_login_rate_limit():
    """O contador de tentativas de login é um dict em memória no módulo —
    limpa entre testes para um teste não vazar limite para o outro."""
    server._LOGIN_ATTEMPTS.clear()
    yield
    server._LOGIN_ATTEMPTS.clear()


@pytest.fixture
def client(fake_db):
    return TestClient(server.app)


@pytest.fixture
def register_user(client):
    """Cria e retorna (user_dict, token, auth_headers) para um usuário novo."""
    def _register(name="Amanda Teste", email="amanda@example.com", password="senha123"):
        res = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        assert res.status_code == 200, res.text
        body = res.json()
        headers = {"Authorization": f"Bearer {body['token']}"}
        return body["user"], body["token"], headers
    return _register
