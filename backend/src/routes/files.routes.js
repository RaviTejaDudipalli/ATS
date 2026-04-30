const path = require('path');
const fs = require('fs');
const router = require('express').Router();

const { prisma } = require('../lib/prisma');
const { env } = require('../lib/config');
const { authenticate } = require('../middleware/auth');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../lib/errors');

const uploadDir = path.resolve(env.UPLOAD_DIR);

/**
 * Auth-gated resume download.
 *
 * Access policy:
 *   - The resume's owning candidate may always download it.
 *   - A recruiter may download it ONLY if the candidate has applied to one
 *     of *that recruiter's* jobs. Anyone else gets 404 (we don't leak the
 *     resource's existence).
 */
router.get('/resumes/:resumeId', authenticate, async (req, res, next) => {
  try {
    const resume = await prisma.resume.findUnique({
      where: { id: req.params.resumeId },
      include: { candidate: { select: { id: true, userId: true } } },
    });
    if (!resume) throw new NotFoundError('Resume not found');

    let allowed = false;
    if (req.user.role === 'CANDIDATE' && resume.candidate.userId === req.user.sub) {
      allowed = true;
    } else if (req.user.role === 'RECRUITER') {
      const recruiter = await prisma.recruiter.findUnique({
        where: { userId: req.user.sub },
        select: { id: true },
      });
      if (recruiter) {
        const link = await prisma.application.findFirst({
          where: {
            candidateId: resume.candidate.id,
            job: { recruiterId: recruiter.id },
          },
          select: { id: true },
        });
        if (link) allowed = true;
      }
    }

    if (!allowed) throw new NotFoundError('Resume not found');

    // Path-traversal guard: storagePath should be a basename only.
    const safeName = path.basename(resume.storagePath);
    const fullPath = path.join(uploadDir, safeName);
    if (!fullPath.startsWith(uploadDir + path.sep) && fullPath !== uploadDir) {
      throw new BadRequestError('Invalid path');
    }
    if (!fs.existsSync(fullPath)) throw new NotFoundError('File missing');

    res.setHeader('Content-Type', resume.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(resume.fileName)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
// Exported so ForbiddenError isn't unused in dev imports — kept for parity.
void ForbiddenError;
