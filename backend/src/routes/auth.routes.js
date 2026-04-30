const router = require('express').Router();
const bcrypt = require('bcryptjs');

const { prisma } = require('../lib/prisma');
const { env } = require('../lib/config');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} = require('../lib/jwt');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/security');
const { auth } = require('../validation/schemas');
const {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} = require('../lib/errors');

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
  res.status(201).json({ ...tokens, user: publicUser(user) });
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
  res.json({ ...tokens, user: publicUser(user) });
});

/**
 * Rotate refresh tokens. If a previously-rotated token is replayed (already
 * revoked but a client still has it), revoke the entire user's token set —
 * a strong signal of compromise.
 */
router.post('/refresh', validate({ body: auth.refresh }), async (req, res) => {
  const tokenHash = hashRefreshToken(req.body.refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record || record.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid refresh token');
  }
  if (record.revokedAt) {
    // Replay of a rotated token. Nuke the user's whole refresh chain.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    req.log?.warn({ userId: record.userId }, 'refresh token replay detected');
    throw new UnauthorizedError('Session invalidated');
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    include: { candidate: true, recruiter: true },
  });
  if (!user) throw new UnauthorizedError('Invalid refresh token');

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

  res.json({
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: next.raw,
    user: publicUser(user),
  });
});

router.post('/logout', validate({ body: auth.refresh }), async (req, res) => {
  const tokenHash = hashRefreshToken(req.body.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
