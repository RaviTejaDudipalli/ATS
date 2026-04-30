'use client';

/**
 * API client.
 *
 * Authentication is cookie-based (httpOnly access + refresh cookies). The
 * client's only job for auth is to:
 *
 *   1. Send credentials on every request (`credentials: 'include'`).
 *   2. Echo the CSRF cookie back as `X-CSRF-Token` on mutating requests.
 *   3. Transparently retry once after a 401 by hitting `/api/auth/refresh`.
 *
 * Legacy localStorage-based bearer flow has been removed. The Authorization
 * header path is still supported on the *server* for non-browser clients.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const CSRF_COOKIE = 'XSRF-TOKEN';

// ---------- file URL helper ----------

export function fileUrl(pathOrAbsolute) {
  if (!pathOrAbsolute) return '';
  if (/^https?:\/\//i.test(pathOrAbsolute)) return pathOrAbsolute;
  return `${BASE}${pathOrAbsolute.startsWith('/') ? '' : '/'}${pathOrAbsolute}`;
}

// ---------- CSRF token cache ----------
//
// We mirror the cookie value into memory so we don't pay a `document.cookie`
// scan on every request. The server rotates the cookie on login / refresh,
// so we re-read after those calls. SSR returns null safely.

let csrfCache = null;

function readCsrfCookie() {
  if (typeof document === 'undefined') return null;
  const target = `${CSRF_COOKIE}=`;
  for (const part of document.cookie.split(';')) {
    const c = part.trim();
    if (c.startsWith(target)) {
      try {
        return decodeURIComponent(c.slice(target.length));
      } catch {
        return c.slice(target.length);
      }
    }
  }
  return null;
}

function getCsrfToken() {
  if (csrfCache) return csrfCache;
  csrfCache = readCsrfCookie();
  return csrfCache;
}

/** Force a re-read on the next request — call after auth state changes. */
function invalidateCsrfCache() {
  csrfCache = null;
}

/** Pre-fetch a CSRF token for unauthenticated forms (login/signup). */
export async function ensureCsrfToken() {
  if (getCsrfToken()) return csrfCache;
  try {
    await fetch(`${BASE}/api/auth/csrf`, { credentials: 'include' });
  } catch {
    /* network error; ensureCsrf is best-effort */
  }
  invalidateCsrfCache();
  return getCsrfToken();
}

// ---------- auth-failure pub/sub ----------

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

// ---------- transparent refresh ----------
//
// Single-flight: if N concurrent requests all 401 at once, only one fires
// `/refresh`; the rest await the same promise.

let refreshInflight = null;

async function refreshAccessToken() {
  if (refreshInflight) return refreshInflight;

  refreshInflight = (async () => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: '{}',
      });
      if (!res.ok) throw new Error('refresh failed');
      // The server set new auth + CSRF cookies; refresh our cache.
      invalidateCsrfCache();
      return true;
    } catch {
      invalidateCsrfCache();
      notifyAuthFailure();
      return false;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

// ---------- core fetch wrapper ----------

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function rawFetch(path, { method = 'GET', body, formData, headers = {}, _retry = false } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };

  if (MUTATING.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) init.headers['X-CSRF-Token'] = csrf;
  }

  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, init);

  // Transparent one-shot refresh on 401. Skip for auth endpoints themselves
  // — recursing through /refresh on a 401 from /refresh is just noise.
  const isAuthEndpoint =
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/signup') ||
    path.startsWith('/api/auth/refresh') ||
    path.startsWith('/api/auth/logout');

  if (res.status === 401 && !_retry && !isAuthEndpoint) {
    const ok = await refreshAccessToken();
    if (ok) return rawFetch(path, { method, body, formData, headers, _retry: true });
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
 * Authenticated download. Cookies ride along for free, so we don't have to
 * pre-fetch with a bearer token any more — but we still need fetch-then-blob
 * because the browser won't pass our same-site auth cookies on a plain `<a>`
 * click that opens a new tab to a different origin.
 */
export async function downloadProtected(path, { filename } = {}) {
  let res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) res = await fetch(`${BASE}${path}`, { credentials: 'include' });
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
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export { ApiClientError, invalidateCsrfCache };
