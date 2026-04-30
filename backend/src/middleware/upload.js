const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const crypto = require('crypto');

const { env } = require('../lib/config');
const { BadRequestError } = require('../lib/errors');

const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.txt']); // .doc dropped — see resumeParser
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_RESUME_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new BadRequestError(`Unsupported file type: ${ext || 'unknown'}`));
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      // Some browsers send octet-stream for DOCX; tolerate that, the magic
      // check below is the real gate.
      if (file.mimetype !== 'application/octet-stream') {
        return cb(new BadRequestError(`Unsupported MIME type: ${file.mimetype}`));
      }
    }
    cb(null, true);
  },
});

/**
 * Magic-byte verification. Runs AFTER multer has written the file. We delete
 * the file and reject if its sniffed type doesn't match the claimed
 * extension — defends against renamed-extension attacks.
 *
 * `file-type@16` is CommonJS friendly; v17+ is ESM-only.
 */
async function verifyFileMagic(req, _res, next) {
  if (!req.file) return next();
  try {
    const FileType = require('file-type');
    const detected = await FileType.fromFile(req.file.path);
    const ext = path.extname(req.file.originalname).toLowerCase();

    // text/plain has no magic — accept based on extension if it's small &
    // looks like UTF-8.
    if (ext === '.txt') {
      const buf = await fsp.readFile(req.file.path);
      // Reject if there are NULs in the first 4KB (binary masquerading as txt).
      if (buf.subarray(0, 4096).includes(0)) {
        await safeUnlink(req.file.path);
        return next(new BadRequestError('TXT file contains binary data'));
      }
      return next();
    }

    if (!detected) {
      await safeUnlink(req.file.path);
      return next(new BadRequestError('Could not verify file format'));
    }

    const ok =
      (ext === '.pdf' && detected.mime === 'application/pdf') ||
      (ext === '.docx' && detected.mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    if (!ok) {
      await safeUnlink(req.file.path);
      return next(
        new BadRequestError(
          `File contents (${detected.mime}) do not match extension (${ext})`,
        ),
      );
    }
    next();
  } catch (err) {
    await safeUnlink(req.file.path);
    next(err);
  }
}

async function safeUnlink(p) {
  try { await fsp.unlink(p); } catch { /* swallow */ }
}

module.exports = { upload, uploadDir, verifyFileMagic };
