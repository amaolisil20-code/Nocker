import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const OF_ALLOW_FALLBACK = process.env.EXPO_PUBLIC_OPEN_FINANCE_ALLOW_FALLBACK !== 'false';

// Cache do token em memória — evita AsyncStorage a cada request
let _tokenCache: string | null | undefined = undefined;

export async function getToken(): Promise<string | null> {
  if (_tokenCache !== undefined) return _tokenCache;
  _tokenCache = await AsyncStorage.getItem('nocker_token');
  return _tokenCache;
}

export async function setToken(token: string) {
  _tokenCache = token;
  await AsyncStorage.setItem('nocker_token', token);
}

export async function clearToken() {
  _tokenCache = null;
  await AsyncStorage.removeItem('nocker_token');
}

// Acorda o servidor Railway logo ao importar a API (evita cold start)
fetch(`${BASE}/health`, { method: 'GET' }).catch(() => {});

async function request(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: any = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...opts, headers, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Servidor indisponível. Verifique se o backend está rodando.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || res.statusText || 'Erro';
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

const OF_MOCK_KEY = 'nocker_of_mock_connections_v1';
let _ofRuntimeMode: 'unknown' | 'real' | 'mock-backend' | 'mock-fallback' = 'unknown';

const OF_INSTITUTIONS = [
  { id: 'nubank', name: 'Nubank', provider: 'mock' },
  { id: 'inter', name: 'Banco Inter', provider: 'mock' },
  { id: 'itau', name: 'Itaú', provider: 'mock' },
  { id: 'bradesco', name: 'Bradesco', provider: 'mock' },
  { id: 'santander', name: 'Santander', provider: 'mock' },
  { id: 'bb', name: 'Banco do Brasil', provider: 'mock' },
  { id: 'caixa', name: 'Caixa', provider: 'mock' },
  { id: 'c6', name: 'C6 Bank', provider: 'mock' },
  { id: 'neon', name: 'Neon', provider: 'mock' },
  { id: 'mercado_pago', name: 'Mercado Pago', provider: 'mock' },
];

function isNotFoundError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('404') || msg.includes('not found') || msg.includes('não encontrado');
}

function canUseFallback(error: any): boolean {
  return OF_ALLOW_FALLBACK && isNotFoundError(error);
}

function markOpenFinanceMode(mode: 'real' | 'mock-backend' | 'mock-fallback') {
  _ofRuntimeMode = mode;
}

async function loadOpenFinanceMock(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(OF_MOCK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOpenFinanceMock(rows: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OF_MOCK_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

function buildMockConnection(institution_id: string, institution_name?: string): any {
  const now = new Date().toISOString();
  const id = `mock-${institution_id}-${Date.now()}`;
  const instName = institution_name || OF_INSTITUTIONS.find((i) => i.id === institution_id)?.name || institution_id;
  return {
    connection: {
      id,
      user_id: 'local-user',
      institution_id,
      institution_name: instName,
      status: 'connected',
      last_sync: now,
      created_at: now,
    },
    accounts: [
      {
        id: `acc-${id}-1`,
        connection_id: id,
        account_name: 'Conta Corrente',
        account_type: 'checking',
        balance: 3520.74,
        currency: 'BRL',
      },
    ],
    cards: [
      {
        id: `card-${id}-1`,
        connection_id: id,
        card_name: `${instName} Platinum`,
        card_brand: 'visa',
        limit_total: 9000,
        limit_available: 5400,
        invoice_amount: 3600,
        due_date: '15',
      },
    ],
  };
}

export const api = {
  // auth
  register: (name: string, email: string, password: string) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  googleLogin: (google_id: string, email: string, name: string, avatar_url?: string) =>
    request('/auth/google', { method: 'POST', body: JSON.stringify({ google_id, email, name, avatar_url }) }),
  me: () => request('/auth/me'),
  updateProfile: (data: { name?: string; username?: string; phone?: string; birth_date?: string; avatar_url?: string }) =>
    request('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) =>
    request('/auth/password', { method: 'PATCH', body: JSON.stringify({ current_password, new_password }) }),
  deleteAccount: (password: string) =>
    request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }),

  uploadAvatar: async (uri: string) => {
    const token = await getToken();
    const filename = uri.split('/').pop() || 'avatar.jpg';
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'jpg';
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const formData = new FormData();
    formData.append('file', { uri, name: filename.includes('.') ? filename : 'avatar.jpg', type } as any);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/auth/avatar/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('Tempo esgotado ao enviar a foto.');
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.detail) || res.statusText || 'Erro ao enviar foto';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  },

  // transactions
  listTransactions: () => request('/transactions'),
  createTransaction: (data: any) =>
    request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: any) =>
    request(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTransaction: (id: string) =>
    request(`/transactions/${id}`, { method: 'DELETE' }),

  // cards
  listCards: () => request('/cards'),
  createCard: (data: any) =>
    request('/cards', { method: 'POST', body: JSON.stringify(data) }),
  deleteCard: (id: string) => request(`/cards/${id}`, { method: 'DELETE' }),

  // open finance
  getOpenFinanceStatus: async () => {
    try {
      const status = await request('/open-finance/status');
      markOpenFinanceMode(status?.mode === 'real' ? 'real' : 'mock-backend');
      return {
        mode: status?.mode === 'real' ? 'real' : 'mock',
        provider: status?.provider || 'mock',
        fallback_reason: status?.fallback_reason || null,
      };
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      return {
        mode: 'mock',
        provider: 'fallback',
        fallback_reason: 'Backend sem endpoint de status Open Finance',
      };
    }
  },
  createOpenFinanceConnectToken: async (clientUserId: string) => {
    return request('/open-finance/connect-token', {
      method: 'POST',
      body: JSON.stringify({ client_user_id: clientUserId }),
    });
  },
  getOpenFinanceRuntimeMode: () => _ofRuntimeMode,
  listOpenFinanceInstitutions: async () => {
    try {
      const rows = await request('/open-finance/institutions');
      if (_ofRuntimeMode === 'unknown') markOpenFinanceMode('real');
      return rows;
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      return OF_INSTITUTIONS;
    }
  },
  listOpenFinanceConnections: async () => {
    try {
      const rows = await request('/open-finance/connections');
      if (_ofRuntimeMode === 'unknown') markOpenFinanceMode('real');
      return rows;
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      return loadOpenFinanceMock();
    }
  },
  connectOpenFinanceBank: async (institution_id: string, institution_name?: string, provider_item_id?: string) => {
    try {
      return await request('/open-finance/connections/connect', {
        method: 'POST',
        body: JSON.stringify({ institution_id, institution_name, provider_item_id }),
      });
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      const rows = await loadOpenFinanceMock();
      const created = buildMockConnection(institution_id, institution_name);
      const next = [created, ...rows.filter((r) => r?.connection?.institution_id !== institution_id)];
      await saveOpenFinanceMock(next);
      return created;
    }
  },
  syncOpenFinanceConnection: async (connectionId: string) => {
    try {
      return await request(`/open-finance/connections/${connectionId}/sync`, { method: 'POST' });
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      const rows = await loadOpenFinanceMock();
      const now = new Date().toISOString();
      const next = rows.map((r) =>
        r?.connection?.id === connectionId
          ? { ...r, connection: { ...r.connection, status: 'connected', last_sync: now } }
          : r
      );
      await saveOpenFinanceMock(next);
      return next.find((r) => r?.connection?.id === connectionId) || null;
    }
  },
  syncOpenFinanceAll: async () => {
    try {
      return await request('/open-finance/sync-all', { method: 'POST' });
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      const rows = await loadOpenFinanceMock();
      const now = new Date().toISOString();
      const next = rows.map((r) => ({ ...r, connection: { ...r.connection, status: 'connected', last_sync: now } }));
      await saveOpenFinanceMock(next);
      return { ok: true, connections: next.length };
    }
  },
  disconnectOpenFinanceConnection: async (connectionId: string) => {
    try {
      return await request(`/open-finance/connections/${connectionId}`, { method: 'DELETE' });
    } catch (e: any) {
      if (!canUseFallback(e)) throw e;
      markOpenFinanceMode('mock-fallback');
      const rows = await loadOpenFinanceMock();
      const next = rows.filter((r) => r?.connection?.id !== connectionId);
      await saveOpenFinanceMock(next);
      return { ok: true };
    }
  },

  // goals
  listGoals: () => request('/goals'),
  createGoal: (data: any) =>
    request('/goals', { method: 'POST', body: JSON.stringify(data) }),
  updateGoal: (id: string, data: any) =>
    request(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteGoal: (id: string) => request(`/goals/${id}`, { method: 'DELETE' }),
  uploadGoalImage: async (goalId: string, uri: string) => {
    const token = await getToken();
    const filename = uri.split('/').pop() || 'goal.jpg';
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'jpg';
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const formData = new FormData();
    formData.append('file', { uri, name: filename.includes('.') ? filename : 'goal.jpg', type } as any);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/goals/${goalId}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('Tempo esgotado ao enviar a imagem.');
      throw e;
    } finally { clearTimeout(timeout); }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error((data && data.detail) || 'Erro ao enviar imagem');
    return data;
  },

  // fixed expenses
  listFixedExpenses: () => request('/fixed-expenses'),
  createFixedExpense: (data: any) =>
    request('/fixed-expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateFixedExpense: (id: string, data: any) =>
    request(`/fixed-expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteFixedExpense: (id: string) =>
    request(`/fixed-expenses/${id}`, { method: 'DELETE' }),

  // installments
  listInstallments: () => request('/installments'),
  createInstallment: (data: any) =>
    request('/installments', { method: 'POST', body: JSON.stringify(data) }),
  updateInstallment: (id: string, data: any) =>
    request(`/installments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInstallment: (id: string) =>
    request(`/installments/${id}`, { method: 'DELETE' }),
  payInstallment: (id: string) =>
    request(`/installments/${id}/pay`, { method: 'POST' }),

  // subscriptions
  listSubscriptions: () => request('/subscriptions'),
  createSubscription: (data: any) =>
    request('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (id: string, data: any) =>
    request(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSubscription: (id: string) =>
    request(`/subscriptions/${id}`, { method: 'DELETE' }),

  // categories
  listCategories: () => request('/categories'),
  createCategory: (data: any) =>
    request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request(`/categories/${id}`, { method: 'DELETE' }),

  // projection
  projection: (months: number = 6) => request(`/projection?months=${months}`),

  // dashboard
  dashboard: () => request('/dashboard/summary'),

  // chat
  chat: (message: string, session_id?: string, opts?: { tone?: string; personality?: string }) =>
    request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        session_id,
        tone: opts?.tone,
        personality: opts?.personality,
      }),
    }),
  chatHistory: (session_id: string) => request(`/chat/history/${session_id}`),

  // financial settings
  getFinancialSettings: () => request('/financial-settings'),
  updateFinancialSettings: (data: { monthly_income?: number; monthly_limit?: number }) =>
    request('/financial-settings', { method: 'PATCH', body: JSON.stringify(data) }),

  // category limits (usa as categorias já criadas pelo usuário)
  listCategoryLimits: () => request('/category-limits'),
  upsertCategoryLimit: (data: { category_name: string; monthly_limit: number; color?: string }) =>
    request('/category-limits', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategoryLimit: (id: string) =>
    request(`/category-limits/${id}`, { method: 'DELETE' }),

  // spending alerts
  listSpendingAlerts: () => request('/spending-alerts'),
  upsertSpendingAlert: (data: { type: string; threshold_pct: number; active: boolean }) =>
    request('/spending-alerts', { method: 'PUT', body: JSON.stringify(data) }),
};