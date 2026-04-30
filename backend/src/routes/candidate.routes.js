const router = require('express').Router();

const { prisma } = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { candidate: candidateSchemas } = require('../validation/schemas');
const { NotFoundError } = require('../lib/errors');

router.get('/me', authenticate, requireRole('CANDIDATE'), async (req, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { userId: req.user.sub },
    include: {
      resume: { select: { id: true, fileName: true, sizeBytes: true, uploadedAt: true } },
      user: { select: { email: true } },
    },
  });
  if (!candidate) throw new NotFoundError('Candidate profile not found');
  res.json({ candidate });
});

router.put(
  '/me',
  authenticate,
  requireRole('CANDIDATE'),
  validate({ body: candidateSchemas.updateProfile }),
  async (req, res) => {
    // Convert empty strings to null so URL-typed fields don't store "".
    const cleaned = Object.fromEntries(
      Object.entries(req.body).map(([k, v]) => [k, v === '' ? null : v]),
    );
    const candidate = await prisma.candidate.update({
      where: { userId: req.user.sub },
      data: cleaned,
      include: {
        resume: { select: { id: true, fileName: true, sizeBytes: true, uploadedAt: true } },
      },
    });
    res.json({ candidate });
  },
);

module.exports = router;
