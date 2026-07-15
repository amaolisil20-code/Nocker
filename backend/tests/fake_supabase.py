"""Cliente Supabase falso, em memória, usado só nos testes.

Reproduz o suficiente da API fluente do supabase-py (table().select()/
.insert()/.update()/.delete()/.eq()/.order()/.limit()/.execute()) para
exercitar as rotas do server.py sem precisar de um Supabase real. Guarda os
dados em dicionários Python no processo do teste; cada teste começa com um
banco vazio (ver fixture `fake_db` em conftest.py).
"""
from __future__ import annotations

import copy
import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional


class FakeResponse:
    def __init__(self, data: List[dict]):
        self.data = data


class FakeQuery:
    def __init__(self, table: "FakeTable"):
        self._table = table
        self._op: Optional[str] = None
        self._payload: Any = None
        self._filters: List[tuple] = []
        self._order_col: Optional[str] = None
        self._order_desc = False
        self._limit_n: Optional[int] = None

    # -- operações --
    def select(self, *_args, **_kwargs) -> "FakeQuery":
        if self._op is None:
            self._op = "select"
        return self

    def insert(self, payload) -> "FakeQuery":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict) -> "FakeQuery":
        self._op = "update"
        self._payload = payload
        return self

    def delete(self) -> "FakeQuery":
        self._op = "delete"
        return self

    # -- filtros/modificadores --
    def eq(self, col: str, val: Any) -> "FakeQuery":
        self._filters.append((col, val))
        return self

    def order(self, col: str, desc: bool = False) -> "FakeQuery":
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, n: int) -> "FakeQuery":
        self._limit_n = n
        return self

    # -- execução --
    def _matches(self, row: dict) -> bool:
        return all(row.get(col) == val for col, val in self._filters)

    def execute(self) -> FakeResponse:
        rows = self._table.rows
        if self._op == "select":
            result = [copy.deepcopy(r) for r in rows if self._matches(r)]
            if self._order_col:
                result.sort(key=lambda r: r.get(self._order_col) or "", reverse=self._order_desc)
            if self._limit_n is not None:
                result = result[: self._limit_n]
            return FakeResponse(result)

        if self._op == "insert":
            docs = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for doc in docs:
                doc = dict(doc)
                doc.setdefault("id", str(uuid.uuid4()))
                rows.append(doc)
                inserted.append(copy.deepcopy(doc))
            return FakeResponse(inserted)

        if self._op == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self._payload)
                    updated.append(copy.deepcopy(row))
            return FakeResponse(updated)

        if self._op == "delete":
            to_remove = [r for r in rows if self._matches(r)]
            for r in to_remove:
                rows.remove(r)
            return FakeResponse([copy.deepcopy(r) for r in to_remove])

        raise RuntimeError("Nenhuma operação (select/insert/update/delete) foi chamada antes de execute().")


class FakeTable:
    def __init__(self, rows: List[dict]):
        self.rows = rows

    def select(self, *args, **kwargs) -> FakeQuery:
        return FakeQuery(self).select(*args, **kwargs)

    def insert(self, payload) -> FakeQuery:
        return FakeQuery(self).insert(payload)

    def update(self, payload: dict) -> FakeQuery:
        return FakeQuery(self).update(payload)

    def delete(self) -> FakeQuery:
        return FakeQuery(self).delete()


class FakeAuth:
    """Stub de supabase.auth — por padrão nenhum token é válido.
    Testes que precisam simular um login Google configuram
    `fake_supabase.auth.set_user(...)` (ver conftest.py)."""

    def __init__(self):
        self._users_by_token: Dict[str, SimpleNamespace] = {}

    def set_user(self, token: str, *, id: str, email: str, email_confirmed_at="2024-01-01T00:00:00Z", user_metadata=None):
        self._users_by_token[token] = SimpleNamespace(
            id=id, email=email, email_confirmed_at=email_confirmed_at, user_metadata=user_metadata or {},
        )

    def get_user(self, jwt: Optional[str] = None):
        user = self._users_by_token.get(jwt)
        if not user:
            raise Exception("invalid token")
        return SimpleNamespace(user=user)


class FakeSupabase:
    """Substitui `server.supabase` nos testes."""

    def __init__(self):
        self._tables: Dict[str, List[dict]] = {}
        self.auth = FakeAuth()

    def table(self, name: str) -> FakeTable:
        return FakeTable(self._tables.setdefault(name, []))
