/**
 * Cookie helpers.
 *
 * We don't pull in `cookie-parser` — parsing the `Cookie` header is twenty
 * lines and the dependency surface is tiny but real. Setters live here so
 * SameSite / Secure / Path defaults stay consistent across auth + CSRF code.
 */

const { env } = require('./config');

function parseCookieHeader(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    let value = part.slice(eq + 1).trim();
    // RFC 6265 allows quoted values; strip the quotes.
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** Express middleware: attach `req.cookies` once per request. */
function cookieMiddleware(req, _res, next) {
  if (!req.cookies) req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

function baseAttrs(extra = {}) {
  const attrs = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    ...extra,
  };
  if (env.COOKIE_DOMAIN) attrs.domain = env.COOKIE_DOMAIN;
  return attrs;
}

function serializeCookie(name, value, attrs) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (attrs.maxAge != null) parts.push(`Max-Age=${Math.floor(attrs.maxAge / 1000)}`);
  if (attrs.expires) parts.push(`Expires=${attrs.expires.toUTCString()}`);
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (attrs.path) parts.push(`Path=${attrs.path}`);
  if (attrs.httpOnly) parts.push('HttpOnly');
  if (attrs.secure) parts.push('Secure');
  if (attrs.sameSite) {
    const ss = String(attrs.sameSite);
    parts.push(`SameSite=${ss[0].toUpperCase()}${ss.slice(1)}`);
  }
  return parts.join('; ');
}

function appendCookie(res, header) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', header);
  else if (Array.isArray(existing)) res.setHeader('Set-Cookie', existing.concat(header));
  else res.setHeader('Set-Cookie', [existing, header]);
}

function setCookie(res, name, value, extra = {}) {
  appendCookie(res, serializeCookie(name, value, baseAttrs(extra)));
}

function clearCookie(res, name, extra = {}) {
  // Match the Path/Domain used to set the cookie or the browser won't drop it.
  appendCookie(
    res,
    serializeCookie(name, '', baseAttrs({ ...extra, maxAge: 0, expires: new Date(0) })),
  );
}

/**
 * Set the access-token cookie. HttpOnly so JS can't read it.
 * Path '/' so it's sent on every API call.
 */
function setAccessCookie(res, token, ttlMs) {
  setCookie(res, env.ACCESS_COOKIE_NAME, token, { maxAge: ttlMs });
}
function clearAccessCookie(res) {
  clearCookie(res, env.ACCESS_COOKIE_NAME);
}

/**
 * Refresh-token cookie is scoped to the auth endpoints that need it. That
 * narrows the surface — the rest of the API never sees the refresh token,
 * so an XSS that escapes (somehow) past httpOnly via a same-origin proxy
 * still can't trigger refresh.
 */
const REFRESH_PATH = '/api/auth';

function setRefreshCookie(res, token, ttlMs) {
  setCookie(res, env.REFRESH_COOKIE_NAME, token, { maxAge: ttlMs, path: REFRESH_PATH });
}
function clearRefreshCookie(res) {
  clearCookie(res, env.REFRESH_COOKIE_NAME, { path: REFRESH_PATH });
}

/**
 * CSRF cookie: NOT httpOnly so the SPA can echo it in a header. The token
 * itself is HMAC-signed (see middleware/csrf) so an attacker can't fabricate
 * a value that matches what the server will accept.
 */
function setCsrfCookie(res, token, ttlMs) {
  setCookie(res, env.CSRF_COOKIE_NAME, token, { maxAge: ttlMs, httpOnly: false });
}
function clearCsrfCookie(res) {
  clearCookie(res, env.CSRF_COOKIE_NAME, { httpOnly: false });
}

module.exports = {
  cookieMiddleware,
  parseCookieHeader,
  setAccessCookie,
  clearAccessCookie,
  setRefreshCookie,
  clearRefreshCookie,
  setCsrfCookie,
  clearCsrfCookie,
  REFRESH_PATH,
};
