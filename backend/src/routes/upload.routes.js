const router = require('express').Router();
const path = require('path');

const { prisma } = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { upload, verifyFileMagic } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/security');
const { extractText, extractSkills } = require('../services/resumeParser');
const scoringQueue = require('../services/scoringQueue');

router.post(
  '/resume',
  authenticate,
  requireRole('CANDIDATE'),
  uploadLimiter,
  upload.single('resume'),
  verifyFileMagic,
  async (req, res, next) => {
    try {
      if (!req.file) {
        const { BadRequestError } = require('../lib/errors');
        throw new BadRequestError('No file uploaded');
      }

      const candidate = await prisma.candidate.findUniqueOrThrow({
        where: { userId: req.user.sub },
        include: { resume: true },
      });

      const extractedText = await extractText(req.file.path, req.file.mimetype);
      const detectedSkills = extractSkills(extractedText).join(', ');

      const data = {
        fileName: req.file.originalname,
        storagePath: path.basename(req.file.path),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        extractedText,
        detectedSkills,
      };

      const resume = candidate.resume
        ? await prisma.resume.update({ where: { candidateId: candidate.id }, data })
        : await prisma.resume.create({ data: { ...data, candidateId: candidate.id } });

      // Resume changed → re-score every existing application.
      await scoringQueue.rescoreCandidate(candidate.id);

      res.status(201).json({
        resume: {
          id: resume.id,
          fileName: resume.fileName,
          downloadUrl: `/api/files/resumes/${resume.id}`,
          sizeBytes: resume.sizeBytes,
          uploadedAt: resume.uploadedAt,
          textPreview: (resume.extractedText || '').slice(0, 400),
          detectedSkills: detectedSkills ? detectedSkills.split(', ') : [],
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
