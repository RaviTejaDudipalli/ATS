// Side-effect: validates env at startup, fail-fast if anything is wrong.
require('./lib/config');
require('express-async-errors');

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { env } = require('./lib/config');
const { logger } = require('./lib/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { requestContext } = require('./middleware/requestContext');
const {
  helmetMiddleware,
  globalLimiter,
} = require('./middleware/security');
const { cookieMiddleware } = require('./lib/cookies');
const { csrfProtect } = require('./middleware/csrf');
const { NotFoundError } = require('./lib/errors');

const authRoutes = require('./routes/auth.routes');
const jobRoutes = require('./routes/job.routes');
const applicationRoutes = require('./routes/application.routes');
const candidateRoutes = require('./routes/candidate.routes');
const recruiterRoutes = require('./routes/recruiter.routes');
const uploadRoutes = require('./routes/upload.routes');
const fileRoutes = require('./routes/files.routes');
const scoringQueue = require('./services/scoringQueue');

const app = express();

// Make sure the upload directory exists; do it once at boot, not per request.
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Behind a load balancer? Trust the X-Forwarded-* chain to N hops.
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

// --- security & infra middleware (order matters) ---
app.use(helmetMiddleware);
app.use(requestContext);                         // request id + child logger
app.use(
  cors({
    origin: (origin, cb) => {
      // Server-to-server / curl have no Origin — allow.
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));         // JSON bodies stay small;
                                                  // resume uploads use multipart
app.use(cookieMiddleware);                       // populates req.cookies
app.use(globalLimiter);

// CSRF protection. Mounted *before* routes so every state-changing call is
// covered. The middleware is a no-op for GET/HEAD/OPTIONS and for callers
// using `Authorization: Bearer …` (CSRF doesn't apply to non-cookie auth).
//
// The login + signup endpoints are allow-listed: the user has no session
// yet, so there's no double-submit cookie to verify against. Rate limiting
// + the CAPTCHA layer (when enabled) cover those endpoints instead.
app.use((req, res, next) => {
  const path = req.path;
  if (
    path === '/api/auth/login' ||
    path === '/api/auth/signup' ||
    path === '/api/auth/csrf' ||
    path === '/api/health'
  ) {
    return next();
  }
  return csrfProtect(req, res, next);
});

// --- liveness ---
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'ats-backend', env: env.NODE_ENV }),
);

// --- routes ---
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/files', fileRoutes);

// --- 404 + error handler ---
app.use((req, _res, next) => next(new NotFoundError(`No route for ${req.method} ${req.path}`)));
app.use(errorHandler);

// --- boot the scoring backend (Bull or in-memory) ---
scoringQueue.init();

// --- graceful shutdown ---
const server = app.listen(env.PORT, () =>
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'ats-backend listening'),
);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // Stop accepting new connections.
  server.close((err) => {
    if (err) logger.error({ err }, 'http server close failed');
  });

  try {
    await scoringQueue.shutdown();
    const { prisma } = require('./lib/prisma');
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, 'shutdown cleanup failed');
  } finally {
    // Give in-flight requests a brief grace window, then exit.
    setTimeout(() => process.exit(0), 1500).unref();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  shutdown('uncaughtException');
});
