# Nocker — PRD

## Visão
App de gestão financeira inteligente, com aparência fintech premium (dark theme, verde #16A34A), assistente IA (Nocker IA) e foco em UX moderna no mobile (Expo iOS + Android).

## Stack
- Frontend: Expo SDK 54, expo-router, react-native-svg, expo-linear-gradient, AsyncStorage
- Backend: FastAPI + Motor (MongoDB)
- IA: Claude Sonnet 4.5 (anthropic) via `emergentintegrations` usando EMERGENT_LLM_KEY
- Auth: JWT custom (bcrypt + PyJWT), token em AsyncStorage `nocker_token`

## Telas (MVP)
1. **Splash / Index** — verifica token, redireciona.
2. **Login / Register** — JWT custom.
3. **Dashboard** — saldo, entradas/saídas do mês, atalhos rápidos, evolução 6 meses (linha), gastos por categoria (donut), card IA de insight, últimas transações.
4. **Transações** — CRUD, filtros (Todos/Entradas/Saídas), busca, categorias.
5. **Cartões** — cartão estilo carteira digital com gradiente, barra de limite, cor configurável, fechamento/vencimento.
6. **Metas** — progresso animado, gamificação (toque para adicionar valor).
7. **Chat Nocker IA** — bolhas modernas, indicador de digitação, sugestões rápidas, multi-turn com contexto financeiro real do usuário.
8. **Configurações** — perfil, segurança/notificações/exportação (placeholders), logout.

## API (resumo)
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `GET/POST/DELETE /api/transactions`
- `GET/POST/DELETE /api/cards`
- `GET/POST/PATCH/DELETE /api/goals`
- `GET /api/dashboard/summary`
- `POST /api/chat`, `GET /api/chat/history/{session_id}`, `GET /api/chat/sessions`

## Decisões
- Sem dados de seed (decisão do usuário).
- Integração bancária real (Open Finance) → "Em breve".
- Tema dark fixo por enquanto.
