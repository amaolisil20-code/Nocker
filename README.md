# Nocker

App de finanças pessoais para Android e iOS (Expo / React Native) com backend em FastAPI e banco de dados Supabase.

## Estrutura

- `frontend/` — app Expo Router (React Native). Roda em Android, iOS e Web.
- `backend/` — API FastAPI (`server.py`) com autenticação própria (JWT + bcrypt), integração opcional com Open Finance (Pluggy) e OCR de notas fiscais.

## Como rodar localmente

### 1. Banco de dados (Supabase)

Já configurado no projeto `nocker`. Para recriar do zero em outro projeto, rode no SQL Editor, nesta ordem:
- `backend/supabase_schema.sql`
- `backend/open_finance_schema.sql`
- `backend/supabase_missing_tables.sql`

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

O `.env` já está configurado. Se precisar recriar, copie de `.env.example`.

### 3. Frontend

```bash
cd frontend
yarn install
yarn start
```

O `.env` já está configurado com `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000`. Ajuste para o IP local da máquina se for testar num celular físico via Expo Go.

## Deploy

O `Dockerfile` e `railway.json` na raiz do projeto fazem o build do backend (contexto = raiz do repo, copiando `backend/`). Configure o serviço no Railway apontando para a raiz do repositório, com as variáveis de ambiente de `backend/.env.example`.

## Observações

- Captura de notificação bancária (Android) usa código nativo Kotlin em `frontend/android/` — não funciona no Expo Go, só em build nativo (`expo run:android`).
