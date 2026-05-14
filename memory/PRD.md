# Nocker — PRD

## Visão
App de gestão financeira inteligente, com aparência fintech premium (dark theme, verde #16A34A), assistente IA (Nocker IA) e foco em UX moderna no mobile (Expo iOS + Android).

## Stack
- Frontend: Expo SDK 54, expo-router, react-native-svg, expo-linear-gradient, AsyncStorage
- Backend: FastAPI + Motor (MongoDB)
- IA: Claude Sonnet 4.5 (anthropic) via `emergentintegrations` usando EMERGENT_LLM_KEY
- Auth: JWT custom (bcrypt + PyJWT), token em AsyncStorage `nocker_token`

## Telas (Fase A — Atual)
1. Splash / Index — verifica token, redireciona.
2. Login / Register — JWT custom.
3. Dashboard — saldo, entradas/saídas do mês, atalhos rápidos, evolução 6 meses, donut por categoria, insight IA, últimas transações.
4. Transações — CRUD, filtros (Todos/Entradas/Saídas), busca, categorias.
5. Cartões — estilo carteira digital com gradiente, barra de limite.
6. Chat Nocker IA — bolhas modernas, sugestões, multi-turn com contexto financeiro (Claude Sonnet 4.5).
7. **Mais** (5ª aba — menu grid):
   - Metas — gamificação
   - Gastos Fixos — contas recorrentes ativar/pausar
   - Parcelados — compras parceladas (monthly_amount, remaining_amount)
   - Assinaturas — mensal/anual (monthly_cost)
   - Projeção Financeira — hero + gráfico 3/6/12 meses + compromissos
   - Categorias — 10 defaults auto-seed + custom
   - Configurações

## API
- Auth: `POST /api/auth/register|login`, `GET /api/auth/me`
- Transactions/Cards/Goals: `GET/POST/[PATCH]/DELETE`
- Fixed expenses: `/api/fixed-expenses` CRUD + PATCH active
- Installments: `/api/installments` CRUD (computed monthly + remaining)
- Subscriptions: `/api/subscriptions` CRUD (computed monthly_cost)
- Categories: `/api/categories` GET (auto-seed 10), POST, DELETE
- Dashboard: `GET /api/dashboard/summary`
- Projection: `GET /api/projection?months=N`
- Chat: `POST /api/chat`, history endpoints

## Decisões
- Sem dados de seed para o usuário.
- Integração bancária real (Open Finance) → "Em breve".
- Gastos fixos = lista de referência (sem auto-gerar transações).
- Tema dark fixo.
- Bottom tabs: Início | Movimentos | Nocker IA (raised center) | Cartões | Mais.

## Testes
- Backend: 28/28 pytest (14 MVP + 14 Fase A) — 100%.
- Frontend: ~92% e2e via Playwright (telas carregam, CRUDs funcionam, navegação ok).
