/**
 * CSRF protection — double-submit cookie pattern, signed.
 *
 * On login / refresh we mint a token = `random.hmac(random)`. The token is
 * stored in a JS-readable cookie (`XSRF-TOKEN`) and the SPA mirrors it in
 * an `X-CSRF-Token` header on every mutating request. The server verifies:
 *
 *   1. header value === cookie value (constant-time)
 *   2. HMAC signature is valid (proves we issued it; defends against an
 *      attacker who can plant a cookie via a sibling subdomain)
 *
 * GET / HEAD / OPTIONS are exempt — they shouldn't be doing state changes.
 *
 * The bearer-token flow is also exempt: legacy clients (mobile, server-side
 * scripts) authenticating via `Authorization: Bearer <jwt>` are not subject
 * to CSRF because the browser cookie attack vector doesn't apply to them.
 */

const crypto = require('crypto');
const { env } = require('../lib/config');
const { setCsrfCookie } = require('../lib/cookies');
const { ForbiddenError } = require('../lib/errors');

const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hmac(value) {
  return crypto.createHmac('sha256', env.CSRF_SECRET).update(value).digest('base64url');
}

function issueToken() {
  const random = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return `${random}.${hmac(random)}`;
}

function isValidShape(token) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const random = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(random);
  // timingSafeEqual throws on length mismatch — guard first.
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Issue a fresh CSRF token + write the cookie. Call this whenever we
 * (re)establish an authenticated session: login, signup, refresh.
 *
 * The TTL deliberately matches the refresh-token lifetime so the SPA never
 * holds a stale CSRF cookie for an active session.
 */
function issueCsrf(res) {
  const token = issueToken();
  const ttlMs = env.JWT_REFRESH_TTL_DAYS * 86_400_000;
  setCsrfCookie(res, token, ttlMs);
  return token;
}

/**
 * Express middleware. Mounted globally; opts requests *out* when they're
 * safe methods or already authenticated by an Authorization header.
 */
function csrfProtect(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  // Bearer-token requests skip CSRF — see header at top of file.
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return next();

  // No cookies at all? Either the client hasn't logged in (the auth
  // middleware will reject anyway) or it's a non-browser caller using bearer
  // (handled above). Either way nothing to protect against here.
  const cookieToken = req.cookies?.[env.CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];

  if (!cookieToken || !headerToken) {
    return next(new ForbiddenError('CSRF token missing'));
  }
  if (!constantTimeEqual(cookieToken, String(headerToken))) {
    return next(new ForbiddenError('CSRF token mismatch'));
  }
  if (!isValidShape(cookieToken)) {
    return next(new ForbiddenError('CSRF token invalid'));
  }
  next();
}

module.exports = {
  csrfProtect,
  issueCsrf,
  // exposed for tests
  _issueToken: issueToken,
  _isValidShape: isValidShape,
};
