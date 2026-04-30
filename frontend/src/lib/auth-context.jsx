'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  ensureCsrfToken,
  invalidateCsrfCache,
  onAuthFailure,
} from './api';

const AuthContext = createContext(null);

/**
 * Auth state lives in cookies the JS can't read (httpOnly access + refresh).
 * The provider's job is now just to:
 *
 *   - Probe `/me` on mount to recover any existing session.
 *   - Refresh user state after login / signup / logout.
 *   - React to hard auth-failure signals from the api client.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
    } catch {
      // Either no session or one that won't refresh — treat as logged out.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Make sure we have a CSRF cookie before posting to /login the first time.
    ensureCsrfToken().finally(() => { refresh(); });
  }, [refresh]);

  useEffect(() => onAuthFailure(() => {
    invalidateCsrfCache();
    setUser(null);
  }), []);

  const login = useCallback(async (email, password) => {
    await ensureCsrfToken();
    const data = await api.post('/api/auth/login', { email, password });
    invalidateCsrfCache();          // server rotated the CSRF cookie
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    await ensureCsrfToken();
    const data = await api.post('/api/auth/signup', payload);
    invalidateCsrfCache();
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      /* already logged out client-side; server-side best-effort */
    }
    invalidateCsrfCache();
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
