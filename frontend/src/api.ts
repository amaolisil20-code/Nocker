import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
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
  me: () => request('/auth/me'),

  // transactions
  listTransactions: () => request('/transactions'),
  createTransaction: (data: any) =>
    request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
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

  // dashboard
  dashboard: () => request('/dashboard/summary'),

  // chat
  chat: (message: string, session_id?: string) =>
    request('/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }),
  chatHistory: (session_id: string) => request(`/chat/history/${session_id}`),
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
