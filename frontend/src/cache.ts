/**
 * Cache simples com AsyncStorage.
 * Salva dados localmente para exibição imediata enquanto a API atualiza em background.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'nocker_cache_';
const TTL_MS = 5 * 60 * 1000; // 5 minutos — depois disso força refresh

type CacheEntry<T> = { data: T; ts: number };

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch { /* ignore — cache é best-effort */ }
}

export async function cacheGet<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return { data: entry.data, stale: Date.now() - entry.ts > TTL_MS };
  } catch { return null; }
}

export async function cacheClear(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/**
 * Padrão stale-while-revalidate:
 * 1. Retorna dados do cache imediatamente (se existir)
 * 2. Busca dados novos da API em paralelo
 * 3. Chama onUpdate quando os dados novos chegarem
 */
export async function staleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T, fromCache: boolean) => void,
): Promise<void> {
  // 1. Mostra cache imediatamente
  const cached = await cacheGet<T>(key);
  if (cached) {
    onData(cached.data, true);
    // Se ainda fresco, não precisa refetch
    if (!cached.stale) return;
  }

  // 2. Busca dados frescos em background
  try {
    const fresh = await fetcher();
    await cacheSet(key, fresh);
    onData(fresh, false);
  } catch (e) {
    // Se já temos cache, silencia o erro — usuário já vê os dados antigos
    if (!cached) throw e;
  }
}
