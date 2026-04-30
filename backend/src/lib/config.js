/**
 * Fail-fast environment validation. Loaded once at startup so misconfiguration
 * surfaces before the server accepts traffic — never silently at first use.
 */
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters')
    .optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_PER_15M: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_UPLOAD_PER_HOUR: z.coerce.number().int().positive().default(20),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_RESUME_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  REDIS_URL: z.string().url().optional(),

  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print all issues at once so ops can fix everything in a single pass.
  console.error('[config] invalid environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

// Default refresh secret to JWT_SECRET only outside production — easier dev,
// safer prod (forces explicit configuration there).
if (!env.JWT_REFRESH_SECRET) {
  if (env.NODE_ENV === 'production') {
    console.error('[config] JWT_REFRESH_SECRET is required in production');
    process.exit(1);
  }
  env.JWT_REFRESH_SECRET = env.JWT_SECRET + ':refresh';
}

env.CORS_ORIGINS = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
env.IS_PROD = env.NODE_ENV === 'production';

module.exports = { env };
