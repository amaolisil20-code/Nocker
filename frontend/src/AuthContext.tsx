import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken, getToken } from './api';

type User = { id: string; name: string; email: string; created_at: string };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (t) {
        try {
          const u = await api.me();
          setUser(u);
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    setUser(r.user);
  };
  const register = async (name: string, email: string, password: string) => {
    const r = await api.register(name, email, password);
    await setToken(r.token);
    setUser(r.user);
  };
  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
