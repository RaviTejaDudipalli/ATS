'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ACCESS_KEY = 'ats_token';
const REFRESH_KEY = 'ats_refresh';

// ---------- token storage ----------

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}
export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(ACCESS_KEY, token);
  else window.localStorage.removeItem(ACCESS_KEY);
}
export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(REFRESH_KEY, token);
  else window.localStorage.removeItem(REFRESH_KEY);
}

export function fileUrl(pathOrAbsolute) {
  if (!pathOrAbsolute) return '';
  if (/^https?:\/\//i.test(pathOrAbsolute)) return pathOrAbsolute;
  return `${BASE}${pathOrAbsolute.startsWith('/') ? '' : '/'}${pathOrAbsolute}`;
}

// Subscribers get notified when refresh fails so the AuthProvider can log out.
const authFailureListeners = new Set();
export function onAuthFailure(fn) {
  authFailureListeners.add(fn);
  return () => authFailureListeners.delete(fn);
}
function notifyAuthFailure() {
  for (const fn of authFailureListeners) try { fn(); } catch { /* ignore */ }
}

// ---------- response handling ----------

class ApiClientError extends Error {
  constructor(message, { status, code, requestId, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

async function handle(res) {
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    // Handle the new `{ error: { code, message, details, requestId } }` envelope.
    const env = data?.error;
    throw new ApiClientError(env?.message || res.statusText || 'Request failed', {
      status: res.status,
      code: env?.code,
      requestId: env?.requestId,
      details: env?.details,
    });
  }
  return data;
}
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

// ---------- refresh-token rotation ----------

let refreshInflight = null;

async function refreshAccessToken() {
  if (refreshInflight) return refreshInflight;
  const refresh = getRefreshToken();
  if (!refresh) return null;

  refreshInflight = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) throw new Error('refresh failed');
      const data = await res.json();
      setToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch {
      setToken(null);
      setRefreshToken(null);
      notifyAuthFailure();
      return null;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

// ---------- core fetch wrapper ----------

async function rawFetch(path, { method = 'GET', body, formData, headers = {}, _retry = false } = {}) {
  const token = getToken();
  const init = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, init);

  // One-shot transparent refresh on 401 (only for authed requests).
  if (res.status === 401 && !_retry && token) {
    const fresh = await refreshAccessToken();
    if (fresh) return rawFetch(path, { method, body, formData, headers, _retry: true });
  }

  return handle(res);
}

export async function apiFetch(path, opts) {
  return rawFetch(path, opts);
}

export const api = {
  get: (p) => apiFetch(p),
  post: (p, body) => apiFetch(p, { method: 'POST', body }),
  put: (p, body) => apiFetch(p, { method: 'PUT', body }),
  patch: (p, body) => apiFetch(p, { method: 'PATCH', body }),
  del: (p) => apiFetch(p, { method: 'DELETE' }),
  upload: (p, formData) => apiFetch(p, { method: 'POST', formData }),
};

/**
 * Authenticated download: fetches a protected file with the bearer token,
 * then opens it as a blob URL (or triggers a save). Necessary because the
 * browser won't attach our `Authorization` header to plain `<a>` clicks.
 */
export async function downloadProtected(path, { filename } = {}) {
  let token = getToken();
  let res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) {
      res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    }
  }
  if (!res.ok) throw new ApiClientError('Download failed', { status: res.status });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  // Defer revocation so the popup has time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export { ApiClientError };
