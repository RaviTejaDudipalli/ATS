const { verifyAccessToken } = require('../lib/jwt');
const { env } = require('../lib/config');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

/**
 * Resolve the access token from either source. Cookie wins when both are
 * present — that's the modern path for browsers; the header path stays
 * supported for non-browser clients (mobile, scripts, integrations) that
 * predate the cookie migration.
 */
function readAccessToken(req) {
  const cookie = req.cookies?.[env.ACCESS_COOKIE_NAME];
  if (cookie) return { token: cookie, source: 'cookie' };

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return { token, source: 'header' };

  return { token: null, source: null };
}

function authenticate(req, _res, next) {
  const { token, source } = readAccessToken(req);
  if (!token) {
    return next(new UnauthorizedError('Authentication required'));
  }
  try {
    req.user = verifyAccessToken(token);
    req.authSource = source;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient role'));
    }
    next();
  };
}

module.exports = { authenticate, requireRole, readAccessToken };
