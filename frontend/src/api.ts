import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

// Acorda o servidor Railway logo ao importar a API (evita cold start)
// Fire-and-forget — não bloqueia nada
fetch(`${BASE}/health`, { method: 'GET' }).catch(() => {});

async function authHeader() {
  const token = await AsyncStorage.getItem('nocker_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path: string, opts: RequestInit = {}) {
  const headers: any = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
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

export async function setToken(token: string) {
  await AsyncStorage.setItem('nocker_token', token);
}
export async function clearToken() {
  await AsyncStorage.removeItem('nocker_token');
}
export async function getToken() {
  return AsyncStorage.getItem('nocker_token');
}