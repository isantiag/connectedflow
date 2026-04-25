'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface AuthUser { userId: string; email: string; displayName: string; role: string; groups?: string[]; projectIds?: string[]; }

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password?: string) => Promise<string | null>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, login: async () => null, logout: () => {}, loading: true });

const API_BASE = 'http://localhost:4001/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // §11/§13: Auth via HttpOnly cookie — no localStorage token
    fetch(`${API_BASE}/auth/me`, { credentials: 'include', signal: AbortSignal.timeout(10000) })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u && !u.error) setUser(u); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password?: string): Promise<string | null> => {
    try {
      const body: Record<string, string> = { email };
      if (password) body.password = password;
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'include', signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!res.ok) return data.error?.message || data.error || 'Login failed';
      setUser(data.user);
      return null;
    } catch {
      return 'Connection failed';
    }
  };

  const logout = () => {
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(10000) }).catch(() => {});
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
