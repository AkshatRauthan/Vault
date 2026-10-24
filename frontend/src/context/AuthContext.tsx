import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setCsrfToken } from '../lib/api';
import type { PublicUser } from '../lib/types';

interface RegisterInput {
  name: string;
  tag: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (identifier: string, password: string, remember: boolean) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const result = await api.auth.me();
      setCsrfToken(result.csrfToken);
      setUser(result.user);
    } catch {
      setUser(null);
      setCsrfToken(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    const unauthorized = () => {
      setUser(null);
      setCsrfToken(undefined);
    };
    window.addEventListener('vault:unauthorized', unauthorized);
    return () => window.removeEventListener('vault:unauthorized', unauthorized);
  }, [refreshUser]);

  const login = useCallback(async (identifier: string, password: string, remember: boolean) => {
    const result = await api.auth.login({ identifier, password, remember });
    setCsrfToken(result.csrfToken);
    setUser(result.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await api.auth.register(input);
    setCsrfToken(result.csrfToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setCsrfToken(undefined);
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    await api.auth.logoutAll();
    setCsrfToken(undefined);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    register,
    logout,
    logoutAll,
    refreshUser,
    updateUser: setUser,
  }), [user, loading, login, register, logout, logoutAll, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
