'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  getToken,
  setToken,
  getRefreshToken,
  setRefreshToken,
  onAuthFailure,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken() && !getRefreshToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
    } catch {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Reactor for hard logout signals from the api client (refresh exhausted).
  useEffect(() => onAuthFailure(() => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }), []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    const data = await api.post('/api/auth/signup', payload);
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshTok = getRefreshToken();
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    // Best-effort server-side revocation; ignore failure (already logged out locally).
    if (refreshTok) {
      try { await api.post('/api/auth/logout', { refreshToken: refreshTok }); } catch { /* ignore */ }
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, refresh }),
    [user, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
