'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface AuthUser { userId: string; email: string; displayName: string; role: string; groups?: string[]; projectIds?: string[]; }

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password?: string) => Promise<string | null>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, token: null, login: async () => null, logout: () => {}, loading: true });

const API_BASE = 'http://localhost:4001/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('connectedICD_token') : null;
    // Try /auth/me — works in local mode without token too
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (saved) headers['Authorization'] = `Bearer ${saved}`;
    fetch(`${API_BASE}/auth/me`, { headers, signal: AbortSignal.timeout(10000) })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u && !u.error) { setUser(u); if (saved) setToken(saved); }
        else localStorage.removeItem('connectedICD_token');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password?: string): Promise<string | null> => {
    try {
      const body: Record<string, string> = { email };
      if (password) body.password = password;
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (!res.ok) return data.error?.message || data.error || 'Login failed';
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('connectedICD_token', data.token);
      return null; // no error
    } catch {
      return 'Connection failed';
    }
  };

  const logout = () => {
    if (token) fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => {});
    setToken(null); setUser(null);
    localStorage.removeItem('connectedICD_token');
  };

  return <AuthContext.Provider value={{ user, token, login, logout, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
