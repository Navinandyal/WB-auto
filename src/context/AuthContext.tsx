import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AppUser {
  id: number;
  uid: string;
  phone: string;
  email: string;
  name: string;
  displayName: string;
  role: string;
}

interface AuthContextType {
  user: AppUser | null;
  idToken: string | null;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = 'app_auth_token';

function normalizeUser(raw: any): AppUser {
  const name = raw?.name || 'User';
  return {
    id: Number(raw?.id || 0),
    uid: String(raw?.uid || ''),
    phone: String(raw?.phone || ''),
    email: String(raw?.email || ''),
    name,
    displayName: name,
    role: String(raw?.role || 'business_user'),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Session expired');
        const data = await res.json();
        setIdToken(token);
        setUser(normalizeUser(data.user));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setIdToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    void restore();
  }, []);

  const login = async (mobile: string, password: string) => {
    const res = await fetch('/api/auth/mobile-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    setIdToken(data.token);
    setUser(normalizeUser(data.user));
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setIdToken(null);
    setUser(null);
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = idToken || localStorage.getItem(TOKEN_KEY);
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      setIdToken(null);
      setUser(null);
    }
    return response;
  };

  return <AuthContext.Provider value={{ user, idToken, loading, login, logout, fetchWithAuth }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
