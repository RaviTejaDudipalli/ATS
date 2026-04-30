/**
 * Single source of truth for every request shape.
 *
 * Conventions:
 *   - Strings are `.trim()`-ed up front so " foo " never beats "foo" in uniques.
 *   - Optional URL fields accept the literal empty string for forms that send "".
 *   - Enums match Prisma exactly so we can pass the parsed value straight in.
 *   - All numeric query params use `z.coerce` because querystrings are strings.
 */
const { z } = require('zod');

const cuid = z.string().min(10).max(40);
const trimmed = (min = 1, max = 500) => z.string().trim().min(min).max(max);
const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .optional()
  .or(z.literal(''))
  .nullable();

const ROLE = z.enum(['CANDIDATE', 'RECRUITER']);
const JOB_TYPE = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);
const JOB_STATUS = z.enum(['OPEN', 'CLOSED', 'DRAFT']);
const APPLICATION_STATUS = z.enum([
  'APPLIED',
  'REVIEWING',
  'SHORTLISTED',
  'INTERVIEW',
  'REJECTED',
  'HIRED',
]);

// At least one lower, one upper, one digit. 8+ chars. Block leading/trailing
// whitespace because clients sometimes paste with newlines.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/^\S.*\S$|^\S$/, 'Password cannot start or end with whitespace')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

const auth = {
  signup: z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      password,
      role: ROLE,
      fullName: trimmed(1, 120),
      phone: z.string().trim().max(40).optional(),
      company: z.string().trim().max(120).optional(),
      title: z.string().trim().max(120).optional(),
    })
    .refine(
      (d) => d.role !== 'RECRUITER' || (d.company && d.company.length > 0),
      { path: ['company'], message: 'Company is required for recruiters' },
    ),
  login: z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
  }),
  // Cookie-based clients send no body. Legacy bearer clients still send
  // `refreshToken`. Both shapes parse cleanly.
  refresh: z
    .object({ refreshToken: z.string().min(20).max(2048).optional() })
    .partial(),
};

const job = {
  create: z.object({
    title: trimmed(2, 160),
    description: trimmed(10, 20_000),
    location: z.string().trim().max(160).optional().nullable(),
    remote: z.boolean().optional(),
    type: JOB_TYPE.optional(),
    status: JOB_STATUS.optional(),
    salaryMin: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
    salaryMax: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    skills: z.string().trim().max(2_000).optional(),
    minExperience: z.number().int().min(0).max(60).nullable().optional(),
  }),
  list: z.object({
    q: z.string().trim().max(120).optional(),
    type: JOB_TYPE.optional(),
    remote: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  }),
  applicants: z.object({
    sort: z.enum(['score', 'date']).default('score'),
    order: z.enum(['asc', 'desc']).default('desc'),
    status: APPLICATION_STATUS.optional(),
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  }),
  idParam: z.object({ id: cuid }),
};
job.update = job.create.partial();

const application = {
  apply: z.object({
    jobId: cuid,
    coverLetter: z.string().trim().max(20_000).optional(),
  }),
  list: z.object({
    status: APPLICATION_STATUS.optional(),
    sort: z.enum(['score', 'date']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  }),
  updateStatus: z.object({ status: APPLICATION_STATUS }),
  idParam: z.object({ id: cuid }),
};

const candidate = {
  updateProfile: z.object({
    fullName: trimmed(1, 120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    headline: z.string().trim().max(200).nullable().optional(),
    linkedinUrl: optionalUrl,
    githubUrl: optionalUrl,
    portfolioUrl: optionalUrl,
    location: z.string().trim().max(160).nullable().optional(),
  }),
};

module.exports = { auth, job, application, candidate };
