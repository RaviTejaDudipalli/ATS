const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { prisma } = require('../lib/prisma');
const { env } = require('../lib/config');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} = require('../lib/jwt');
const {
  setAccessCookie,
  clearAccessCookie,
  setRefreshCookie,
  clearRefreshCookie,
  clearCsrfCookie,
} = require('../lib/cookies');
const { issueCsrf } = require('../middleware/csrf');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/security');
const { auth } = require('../validation/schemas');
const {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} = require('../lib/errors');

/**
 * Access-token cookie TTL. We mirror the JWT's own expiry — keep them in
 * sync so the cookie doesn't outlive the token (cleaner client behavior on
 * 401s) or get evicted before the JWT is even checked (premature logout).
 *
 * `env.JWT_ACCESS_TTL` is a string like "15m"; we parse loosely.
 */
const ACCESS_COOKIE_TTL_MS = parseDuration(env.JWT_ACCESS_TTL, 15 * 60_000);
const REFRESH_COOKIE_TTL_MS = env.JWT_REFRESH_TTL_DAYS * 86_400_000;

function parseDuration(input, fallback) {
  if (typeof input === 'number') return input;
  const m = /^(\d+)\s*([smhd])?$/i.exec(String(input || '').trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] || 1000;
  return n * mult;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    candidate: user.candidate || null,
    recruiter: user.recruiter || null,
  };
}

async function issueTokens(user, req) {
  const access = signAccessToken({ sub: user.id, role: user.role });
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: (req.headers['user-agent'] || '').slice(0, 255),
      ip: req.ip || null,
    },
  });
  return { accessToken: access, refreshToken: refresh.raw };
}

/**
 * Plant the auth cookies + a fresh CSRF token. Called on every successful
 * login / signup / refresh so the SPA always has a current cookie set.
 *
 * We also keep the body shape from before the cookie migration. Existing
 * bearer-token clients (mobile, scripts) keep working unchanged. New web
 * clients ignore the body and rely on cookies.
 */
function plantSession(res, tokens) {
  setAccessCookie(res, tokens.accessToken, ACCESS_COOKIE_TTL_MS);
  setRefreshCookie(res, tokens.refreshToken, REFRESH_COOKIE_TTL_MS);
  return issueCsrf(res);
}

function clearSession(res) {
  clearAccessCookie(res);
  clearRefreshCookie(res);
  clearCsrfCookie(res);
}

router.post('/signup', authLimiter, validate({ body: auth.signup }), async (req, res) => {
  const data = req.body;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError('An account with that email already exists');

  const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      role: data.role,
      ...(data.role === 'CANDIDATE'
        ? { candidate: { create: { fullName: data.fullName, phone: data.phone || null } } }
        : {
            recruiter: {
              create: {
                fullName: data.fullName,
                company: data.company || 'Independent',
                title: data.title || null,
              },
            },
          }),
    },
    include: { candidate: true, recruiter: true },
  });

  const tokens = await issueTokens(user, req);
  const csrfToken = plantSession(res, tokens);
  res.status(201).json({ ...tokens, csrfToken, user: publicUser(user) });
});

router.post('/login', authLimiter, validate({ body: auth.login }), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { candidate: true, recruiter: true },
  });

  // Constant-time-ish: always run bcrypt to avoid email-existence timing leaks.
  const ok = await bcrypt.compare(
    password,
    user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvaliz',
  );
  if (!user || !ok) throw new UnauthorizedError('Invalid email or password');

  const tokens = await issueTokens(user, req);
  const csrfToken = plantSession(res, tokens);
  res.json({ ...tokens, csrfToken, user: publicUser(user) });
});

/**
 * Endpoint for browsers to fetch a CSRF token before they have a session,
 * e.g. for the login form itself. The login route is allow-listed in the
 * CSRF middleware (see server.js wiring) but having an explicit endpoint
 * keeps the SPA's logic uniform: "always send X-CSRF-Token".
 */
router.get('/csrf', (req, res) => {
  const token = issueCsrf(res);
  res.json({ csrfToken: token });
});

/**
 * Rotate refresh tokens. If a previously-rotated token is replayed (already
 * revoked but a client still has it), revoke the entire user's token set —
 * a strong signal of compromise.
 *
 * Token source priority: cookie first (browser path), body second (legacy
 * bearer clients).
 */
router.post('/refresh', validate({ body: auth.refresh }), async (req, res) => {
  const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (!raw) throw new UnauthorizedError('Refresh token required');

  const tokenHash = hashRefreshToken(raw);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record || record.expiresAt < new Date()) {
    clearSession(res);
    throw new UnauthorizedError('Invalid refresh token');
  }
  if (record.revokedAt) {
    // Replay of a rotated token. Nuke the user's whole refresh chain.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    req.log?.warn({ userId: record.userId }, 'refresh token replay detected');
    clearSession(res);
    throw new UnauthorizedError('Session invalidated');
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    include: { candidate: true, recruiter: true },
  });
  if (!user) {
    clearSession(res);
    throw new UnauthorizedError('Invalid refresh token');
  }

  const next = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: 'pending' },
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: next.hash,
        expiresAt: next.expiresAt,
        userAgent: (req.headers['user-agent'] || '').slice(0, 255),
        ip: req.ip || null,
      },
    }),
  ]);

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const csrfToken = plantSession(res, { accessToken, refreshToken: next.raw });

  res.json({
    accessToken,
    refreshToken: next.raw,
    csrfToken,
    user: publicUser(user),
  });
});

router.post('/logout', validate({ body: auth.refresh }), async (req, res) => {
  const raw = req.cookies?.[env.REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (raw) {
    const tokenHash = hashRefreshToken(raw);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearSession(res);
  res.status(204).send();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { candidate: { include: { resume: true } }, recruiter: true },
  });
  if (!user) throw new NotFoundError('User not found');
  res.json({ user: publicUser(user) });
});

module.exports = router;
