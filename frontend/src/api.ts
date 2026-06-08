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

/** Define token em memória na hora; persiste em background. */
export function setTokenFast(token: string) {
  _tokenCache = token;
  AsyncStorage.setItem('nocker_token', token).catch(() => {});
}

export async function clearToken() {
  _tokenCache = null;
  await AsyncStorage.removeItem('nocker_token');
}

const DEFAULT_TIMEOUT_MS = 15000;

const _inflight = new Map<string, Promise<any>>();

// Acorda o servidor Railway (não bloqueia UI)
if (BASE) {
  fetch(`${BASE}/api/`, { method: 'GET' }).catch(() => {});
}

async function request(path: string, opts: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const method = (opts.method || 'GET').toUpperCase();
  const dedupeKey = method === 'GET' ? `GET:${path}` : '';
  if (dedupeKey && _inflight.has(dedupeKey)) {
    return _inflight.get(dedupeKey);
  }

  const exec = (async () => {
    if (!BASE) {
      throw new Error('Backend não configurado. Verifique EXPO_PUBLIC_BACKEND_URL no .env');
    }
    const token = await getToken();
    const headers: any = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api${path}`, { ...opts, headers, signal: controller.signal });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (e?.name === 'AbortError') {
        throw new Error('O servidor demorou para responder. Verifique sua internet e tente de novo.');
      }
      if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
        throw new Error('Sem conexão com o servidor. Verifique sua internet ou Wi‑Fi.');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.detail) || res.statusText || 'Erro';
      const err: any = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  })();

  if (dedupeKey) {
    _inflight.set(dedupeKey, exec);
    exec.finally(() => { _inflight.delete(dedupeKey); });
  }
  return exec;
}

export function isAuthError(error: any): boolean {
  const status = error?.status;
  if (status === 401 || status === 403) return true;
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('invalid token') ||
    msg.includes('unauthorized') ||
    msg.includes('não autorizado') ||
    msg.includes('sessão expirada')
  );
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
  createNotificationTransaction: (data: {
    amount: number;
    type: 'income' | 'expense';
    description: string;
    bank?: string;
    raw?: string;
  }) => request('/transactions/from-notification', { method: 'POST', body: JSON.stringify(data) }),
  refreshTransactionsCache: async () => {
    const txs = await request('/transactions');
    const { cacheSet } = await import('./cache');
    await cacheSet('transactions_bundle', { txs, cats: [] });
    return txs;
  },
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
  createOpenFinanceConnectToken: async (_clientUserId?: string) => {
    const opts = {
      method: 'POST',
      body: JSON.stringify({}),
    };
    try {
      return await request('/open-finance/connect-token', opts, 60000);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('demorou') || msg.includes('internet')) {
        await fetch(`${BASE}/api/`, { method: 'GET' }).catch(() => {});
        return request('/open-finance/connect-token', opts, 60000);
      }
      throw e;
    }
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
    return request(
      '/open-finance/connections/connect',
      {
        method: 'POST',
        body: JSON.stringify({ institution_id, institution_name, provider_item_id }),
      },
      120000,
    );
  },
  syncOpenFinanceConnection: async (connectionId: string) => {
    return request(`/open-finance/connections/${connectionId}/sync`, { method: 'POST' }, 120000);
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
  syncBanksAndRefresh: async () => {
    try {
      await request('/open-finance/sync-all', { method: 'POST' });
    } catch {
      /* sem bancos conectados */
    }
    const txs = await request('/transactions');
    const { cacheSet } = await import('./cache');
    await cacheSet('transactions_bundle', { txs, cats: [] });
    return txs;
  },
  disconnectOpenFinanceConnection: async (connectionId: string) => {
    return request(`/open-finance/connections/${connectionId}`, { method: 'DELETE' });
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
  // document scan
  confirmScannedDocument: (data: {
    establishment: string;
    amount: number;
    category: string;
    transaction_date: string;
    ocr_text?: string;
    type?: 'income' | 'expense';
  }) => request('/documents/confirm', { method: 'POST', body: JSON.stringify(data) }),
  listScannedDocuments: () => request('/documents/scanned', {}, 30000),
  wakeServer: async () => {
    if (!BASE) return;
    try {
      await fetch(`${BASE}/api/`, { method: 'GET' });
    } catch {
      /* ignora — só acorda o Railway */
    }
  },
  scanDocumentUpload: async (uri: string) => {
    const token = await getToken();
    if (!token) throw new Error('Faça login para escanear documentos.');
    if (!BASE) throw new Error('Backend não configurado. Verifique EXPO_PUBLIC_BACKEND_URL no .env');

    const formData = new FormData();
    formData.append('file', { uri, name: 'receipt.jpg', type: 'image/jpeg' } as any);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/documents/ocr-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error('A análise demorou demais. Tente novamente com boa iluminação.');
      }
      const msg = String(e?.message || '');
      if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
        throw new Error('Sem conexão com o servidor. Verifique sua internet ou Wi‑Fi.');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.detail) || res.statusText || 'Erro ao analisar nota';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  },
  scanDocumentImage: async (image_base64: string) => {
    const token = await getToken();
    if (!token) throw new Error('Faça login para escanear documentos.');
    if (!BASE) throw new Error('Backend não configurado. Verifique EXPO_PUBLIC_BACKEND_URL no .env');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/documents/ocr-base64`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_base64, content_type: 'image/jpeg' }),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error('A leitura da nota demorou demais. Tente de novo — o servidor pode estar iniciando.');
      }
      const msg = String(e?.message || '');
      if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
        throw new Error('Sem conexão com o servidor. Verifique sua internet ou Wi‑Fi.');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.detail) || res.statusText || 'Erro ao analisar nota';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  },

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