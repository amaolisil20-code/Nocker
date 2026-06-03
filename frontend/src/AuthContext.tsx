import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken, getToken } from './api';
import { cacheSet, cacheGet } from './cache';

export type User = {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  birth_date?: string;
  avatar_url?: string;
  created_at: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (google_id: string, email: string, name: string, avatar_url?: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx>({} as any);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        if (!t) { setLoading(false); return; }

        // 1. Carrega usuário do cache imediatamente — sem esperar a rede
        const cached = await cacheGet<User>('user_me');
        if (cached) {
          setUser(cached.data);
          setLoading(false); // libera a tela imediatamente
        }

        // 2. Valida token com o servidor em background
        try {
          const u = await api.me();
          setUser(u);
          await cacheSet('user_me', u);
        } catch {
          // Token inválido — limpa tudo
          await clearToken();
          await cacheSet('user_me', null as any);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    await cacheSet('user_me', r.user);
    setUser(r.user);
  };

  const loginWithGoogle = async (google_id: string, email: string, name: string, avatar_url?: string) => {
    const r = await api.googleLogin(google_id, email, name, avatar_url);
    await setToken(r.token);
    await cacheSet('user_me', r.user);
    setUser(r.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const r = await api.register(name, email, password);
    await setToken(r.token);
    await cacheSet('user_me', r.user);
    setUser(r.user);
  };

  const logout = async () => {
    await clearToken();
    await cacheSet('user_me', null as any);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await api.me();
      setUser(u);
      await cacheSet('user_me', u);
    } catch { /* ignore */ }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithGoogle, register, logout, refreshUser, setUser }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);