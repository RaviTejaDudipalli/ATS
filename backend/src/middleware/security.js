const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { env } = require('../lib/config');
const { TooManyRequestsError } = require('../lib/errors');

/**
 * Security headers. CSP intentionally `false` because this is a JSON API —
 * the frontend serves its own pages and we don't want a CSP collision.
 * Cross-origin resource policy is set to `cross-origin` so the Next.js
 * frontend (different origin in dev) can `<img src>` resume previews etc.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
});

function makeLimiter(opts) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError(opts.message)),
    ...opts,
  });
}

const globalLimiter = makeLimiter({
  windowMs: 60_000,
  max: env.RATE_LIMIT_GLOBAL_PER_MIN,
  message: 'Too many requests — slow down a moment.',
});

const authLimiter = makeLimiter({
  windowMs: 15 * 60_000,
  max: env.RATE_LIMIT_AUTH_PER_15M,
  // Throttle by IP + email so an attacker can't loop emails behind one IP.
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email) || ''}`,
  message: 'Too many sign-in attempts. Try again in a few minutes.',
});

const uploadLimiter = makeLimiter({
  windowMs: 60 * 60_000,
  max: env.RATE_LIMIT_UPLOAD_PER_HOUR,
  message: 'Upload limit reached. Try again later.',
});

module.exports = { helmetMiddleware, globalLimiter, authLimiter, uploadLimiter };
