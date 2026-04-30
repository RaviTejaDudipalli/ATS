const router = require('express').Router();

const { prisma } = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { job: jobSchemas } = require('../validation/schemas');
const { pageMeta } = require('../lib/pagination');
const { escapeLikePattern } = require('../lib/sanitize');
const { NotFoundError } = require('../lib/errors');

// ---------- public ----------

router.get('/', validate({ query: jobSchemas.list }), async (req, res) => {
  const { q, type, remote, page, perPage } = req.query;
  const skip = (page - 1) * perPage;

  const where = {
    status: 'OPEN',
    ...(type ? { type } : {}),
    ...(remote ? { remote: true } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { skills: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: perPage,
      include: {
        recruiter: { select: { fullName: true, company: true } },
        _count: { select: { applications: true } },
      },
    }),
  ]);

  res.json({ jobs, pagination: pageMeta({ page, perPage, total }) });
});

router.get('/:id', validate({ params: jobSchemas.idParam }), async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: {
      recruiter: { select: { fullName: true, company: true } },
      _count: { select: { applications: true } },
    },
  });
  if (!job) throw new NotFoundError('Job not found');
  res.json({ job });
});

// ---------- recruiter CRUD ----------

router.post(
  '/',
  authenticate,
  requireRole('RECRUITER'),
  validate({ body: jobSchemas.create }),
  async (req, res) => {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const job = await prisma.job.create({ data: { ...req.body, recruiterId: recruiter.id } });
    res.status(201).json({ job });
  },
);

router.put(
  '/:id',
  authenticate,
  requireRole('RECRUITER'),
  validate({ params: jobSchemas.idParam, body: jobSchemas.update }),
  async (req, res) => {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.recruiterId !== recruiter.id) throw new NotFoundError('Job not found');

    const job = await prisma.job.update({ where: { id: req.params.id }, data: req.body });
    res.json({ job });
  },
);

router.delete(
  '/:id',
  authenticate,
  requireRole('RECRUITER'),
  validate({ params: jobSchemas.idParam }),
  async (req, res) => {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.recruiterId !== recruiter.id) throw new NotFoundError('Job not found');
    await prisma.job.delete({ where: { id: req.params.id } });
    res.status(204).send();
  },
);

// ---------- recruiter: applicants list ----------

router.get(
  '/:id/applicants',
  authenticate,
  requireRole('RECRUITER'),
  validate({ params: jobSchemas.idParam, query: jobSchemas.applicants }),
  async (req, res) => {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job || job.recruiterId !== recruiter.id) throw new NotFoundError('Job not found');

    const { sort, order, status, q, page, perPage } = req.query;
    const skip = (page - 1) * perPage;
    const orderBy = sort === 'date' ? { appliedAt: order } : { atsScore: order };

    // Push the keyword filter into Postgres instead of pulling everything
    // and filtering in JS. We search across name, email, resume text and
    // cover letter via OR.
    const where = {
      jobId: job.id,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { candidate: { fullName: { contains: q, mode: 'insensitive' } } },
              { candidate: { user: { email: { contains: q, mode: 'insensitive' } } } },
              { candidate: { resume: { extractedText: { contains: q, mode: 'insensitive' } } } },
              { coverLetter: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        orderBy,
        skip,
        take: perPage,
        include: {
          candidate: {
            include: {
              user: { select: { email: true } },
              resume: { select: { id: true, fileName: true, sizeBytes: true } },
            },
          },
        },
      }),
    ]);

    res.json({ job, applications, pagination: pageMeta({ page, perPage, total }) });
  },
);

// Suppress lint warning for the unused import in some toolchains.
void escapeLikePattern;

module.exports = router;
