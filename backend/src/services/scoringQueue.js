/**
 * Async scoring queue.
 *
 * The apply-to-a-job endpoint enqueues a "score this application" job and
 * returns immediately. A worker picks it up, runs the (potentially slow)
 * scoring pipeline, and writes the result back.
 *
 *   - In production with REDIS_URL set, BullMQ runs across processes and
 *     survives restarts.
 *   - In dev / single-process deployments without Redis, an in-process
 *     queue runs jobs on the next tick so the API still responds quickly.
 *
 * Public API (identical regardless of backend):
 *   - enqueueScoreApplication(applicationId)
 *   - rescoreCandidate(candidateId)   // when resume changes
 *   - shutdown()
 */

const { env } = require('../lib/config');
const { logger } = require('../lib/logger');
const { prisma } = require('../lib/prisma');
const { scoreApplication } = require('./atsScoring');

const log = logger.child({ component: 'scoringQueue' });

const JOB_TYPES = {
  SCORE_APPLICATION: 'score-application',
  RESCORE_CANDIDATE: 'rescore-candidate',
};

// ---------- shared work fn ----------

async function runScoreApplication(applicationId) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: true,
      candidate: { include: { resume: true } },
    },
  });
  if (!app) {
    log.warn({ applicationId }, 'application missing during scoring');
    return;
  }

  const resumeText = app.candidate.resume?.extractedText || '';
  const detected = (app.candidate.resume?.detectedSkills || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const { score, breakdown } = scoreApplication({
    job: app.job,
    resumeText,
    resumeSkills: detected,
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: { atsScore: score, scoreBreakdown: breakdown, scoredAt: new Date() },
  });
  log.info({ applicationId, score }, 'application scored');
}

async function runRescoreCandidate(candidateId) {
  const apps = await prisma.application.findMany({
    where: { candidateId },
    select: { id: true },
  });
  for (const a of apps) await runScoreApplication(a.id);
}

// ---------- BullMQ backend ----------

let bullQueue = null;
let bullWorker = null;
let redisConnection = null;

function initBullMQ() {
  const { Queue, Worker } = require('bullmq');
  const Redis = require('ioredis');
  redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  bullQueue = new Queue('ats-scoring', { connection: redisConnection });

  bullWorker = new Worker(
    'ats-scoring',
    async (job) => {
      switch (job.name) {
        case JOB_TYPES.SCORE_APPLICATION:
          return runScoreApplication(job.data.applicationId);
        case JOB_TYPES.RESCORE_CANDIDATE:
          return runRescoreCandidate(job.data.candidateId);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    {
      connection: redisConnection,
      concurrency: 4,
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
    },
  );

  bullWorker.on('failed', (job, err) =>
    log.error({ jobId: job?.id, err: err.message }, 'scoring job failed'),
  );
  log.info('BullMQ scoring queue ready');
}

// ---------- in-process backend ----------

const memoryQueue = [];
let memoryWorking = false;

async function drainMemory() {
  if (memoryWorking) return;
  memoryWorking = true;
  try {
    while (memoryQueue.length) {
      const { name, data } = memoryQueue.shift();
      try {
        if (name === JOB_TYPES.SCORE_APPLICATION) await runScoreApplication(data.applicationId);
        else if (name === JOB_TYPES.RESCORE_CANDIDATE) await runRescoreCandidate(data.candidateId);
      } catch (err) {
        log.error({ err: err.message, name }, 'in-memory scoring job failed');
      }
    }
  } finally {
    memoryWorking = false;
  }
}

function pushMemory(name, data) {
  memoryQueue.push({ name, data });
  setImmediate(drainMemory);
}

// ---------- public API ----------

function init() {
  if (env.REDIS_URL) {
    try {
      initBullMQ();
      return;
    } catch (err) {
      log.warn({ err: err.message }, 'BullMQ init failed; falling back to in-memory queue');
    }
  }
  log.info('using in-memory scoring queue (no REDIS_URL)');
}

async function enqueueScoreApplication(applicationId) {
  if (bullQueue) {
    await bullQueue.add(
      JOB_TYPES.SCORE_APPLICATION,
      { applicationId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  } else {
    pushMemory(JOB_TYPES.SCORE_APPLICATION, { applicationId });
  }
}

async function rescoreCandidate(candidateId) {
  if (bullQueue) {
    await bullQueue.add(JOB_TYPES.RESCORE_CANDIDATE, { candidateId }, { attempts: 2 });
  } else {
    pushMemory(JOB_TYPES.RESCORE_CANDIDATE, { candidateId });
  }
}

async function shutdown() {
  if (bullWorker) await bullWorker.close();
  if (bullQueue) await bullQueue.close();
  if (redisConnection) await redisConnection.quit();
}

module.exports = {
  init,
  enqueueScoreApplication,
  rescoreCandidate,
  shutdown,
  // exported for tests
  _runScoreApplication: runScoreApplication,
};
