const router = require('express').Router();

const { prisma } = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { application: appSchemas } = require('../validation/schemas');
const { pageMeta } = require('../lib/pagination');
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require('../lib/errors');
const scoringQueue = require('../services/scoringQueue');

/**
 * Apply to a job.
 *
 * We do NOT score on the request thread anymore — the application is
 * created with `atsScore=0, scoredAt=null` and the worker writes the real
 * score asynchronously. The UI can poll or just show "scoring…" until
 * `scoredAt` is non-null.
 */
router.post(
  '/',
  authenticate,
  requireRole('CANDIDATE'),
  validate({ body: appSchemas.apply }),
  async (req, res) => {
    const candidate = await prisma.candidate.findUnique({
      where: { userId: req.user.sub },
      include: { resume: true },
    });
    if (!candidate) throw new BadRequestError('Candidate profile missing');
    if (!candidate.resume) {
      throw new BadRequestError('Please upload a resume before applying');
    }

    const job = await prisma.job.findUnique({ where: { id: req.body.jobId } });
    if (!job || job.status !== 'OPEN') {
      throw new BadRequestError('Job is not accepting applications');
    }

    const duplicate = await prisma.application.findUnique({
      where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
    });
    if (duplicate) throw new ConflictError('You have already applied to this job');

    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        coverLetter: req.body.coverLetter || null,
        // Default 0 / null — the worker fills these in.
      },
    });

    await scoringQueue.enqueueScoreApplication(application.id);

    res.status(202).json({
      application,
      scoring: { status: 'pending' },
    });
  },
);

router.get(
  '/me',
  authenticate,
  requireRole('CANDIDATE'),
  validate({ query: appSchemas.list }),
  async (req, res) => {
    const candidate = await prisma.candidate.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const { status, sort, order, page, perPage } = req.query;
    const skip = (page - 1) * perPage;
    const orderBy = sort === 'score' ? { atsScore: order } : { appliedAt: order };

    const where = { candidateId: candidate.id, ...(status ? { status } : {}) };

    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        orderBy,
        skip,
        take: perPage,
        include: { job: { include: { recruiter: { select: { company: true } } } } },
      }),
    ]);

    res.json({ applications, pagination: pageMeta({ page, perPage, total }) });
  },
);

router.patch(
  '/:id/status',
  authenticate,
  requireRole('RECRUITER'),
  validate({ params: appSchemas.idParam, body: appSchemas.updateStatus }),
  async (req, res) => {
    const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { job: true },
    });
    if (!application || application.job.recruiterId !== recruiter.id) {
      throw new NotFoundError('Application not found');
    }

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: { status: req.body.status },
    });
    res.json({ application: updated });
  },
);

module.exports = router;
