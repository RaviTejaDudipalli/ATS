const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/dashboard', authenticate, requireRole('RECRUITER'), async (req, res) => {
  const recruiter = await prisma.recruiter.findUniqueOrThrow({ where: { userId: req.user.sub } });

  const [totalJobs, openJobs, totalApplicants, recentApplications, byStatusRaw, jobs] =
    await Promise.all([
      prisma.job.count({ where: { recruiterId: recruiter.id } }),
      prisma.job.count({ where: { recruiterId: recruiter.id, status: 'OPEN' } }),
      prisma.application.count({ where: { job: { recruiterId: recruiter.id } } }),
      prisma.application.findMany({
        where: { job: { recruiterId: recruiter.id } },
        orderBy: { appliedAt: 'desc' },
        take: 8,
        include: {
          candidate: { include: { user: { select: { email: true } } } },
          job: { select: { id: true, title: true } },
        },
      }),
      prisma.application.groupBy({
        by: ['status'],
        where: { job: { recruiterId: recruiter.id } },
        _count: { _all: true },
      }),
      prisma.job.findMany({
        where: { recruiterId: recruiter.id },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { applications: true } } },
      }),
    ]);

  const byStatus = byStatusRaw.reduce((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});

  res.json({
    stats: { totalJobs, openJobs, totalApplicants },
    byStatus,
    recentApplications,
    jobs,
  });
});

module.exports = router;
