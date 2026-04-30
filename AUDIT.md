# Production Audit — ATS

A senior-engineer review of the existing codebase, with concrete fixes applied
incrementally (no rewrite). This document is the **why**; the diff is the **what**.

> Status legend: ✅ fixed in this pass · 🟡 partially fixed · 📝 documented, deferred.

---

## 1. Issues Found

### Backend architecture
| # | Issue | Severity | Status |
|---|---|---|---|
| B1 | No `helmet` — missing security headers (CSP, HSTS, X-Frame, etc.) | High | ✅ |
| B2 | No rate limiting — auth & upload endpoints brute-force-able | High | ✅ |
| B3 | `cors` falls back to `*` in dev — easy to ship to prod | Med | ✅ |
| B4 | No structured logging or request IDs — debugging in prod is painful | High | ✅ |
| B5 | `JWT_SECRET` validated at first use, not at startup — silent prod risk | High | ✅ |
| B6 | Validation done inline per route — inconsistent, easy to miss a query/param | Med | ✅ |
| B7 | Error responses leak `err.message` for 500s — info disclosure | Med | ✅ |
| B8 | No graceful shutdown — Prisma pool not drained on SIGTERM | Med | ✅ |
| B9 | `morgan('dev')` in prod — unstructured + chatty | Low | ✅ |
| B10 | No request/payload size limits beyond default 5 MB | Low | 🟡 (kept, plus per-route limits) |
| B11 | No refresh token mechanism — users re-login every 7d, no revocation | Med | ✅ |
| B12 | No login throttling beyond global rate limit | Med | ✅ |
| B13 | Password policy is `min(8)` only — weak | Med | ✅ |

### Database
| # | Issue | Severity | Status |
|---|---|---|---|
| D1 | `Application.atsScore` not indexed — sort-by-score scans table | High | ✅ |
| D2 | No composite `(recruiterId, status, createdAt)` for recruiter listings | Med | ✅ |
| D3 | No `RefreshToken` table | Med | ✅ |
| D4 | `Job.skills` stored as comma-separated string — fine for now, but call out | Low | 📝 (planned: `JobSkill` table once volume warrants it) |
| D5 | No way to soft-delete a Job (compliance, audit) | Low | 📝 |

### ATS scoring
| # | Issue | Severity | Status |
|---|---|---|---|
| S1 | No synonym handling — "JS" misses "JavaScript", "K8s" misses "Kubernetes" | High | ✅ |
| S2 | Skill match is plain substring → false positives ("react" in "reaction") | Med | ✅ (token-boundary aware) |
| S3 | Single monolithic file — hard to add scorers | Med | ✅ (modular pipeline) |
| S4 | Weights hard-coded — can't A/B per recruiter or job | Low | 🟡 (now configurable) |
| S5 | Scoring runs on the request thread — slow PDFs block apply API | High | ✅ (queue with in-memory fallback) |

### Resume parsing
| # | Issue | Severity | Status |
|---|---|---|---|
| R1 | No whitespace / hyphenation normalization — multi-column PDFs garbled | High | ✅ |
| R2 | No fallback if `pdf-parse` fails — silent empty text | Med | ✅ |
| R3 | `.doc` (legacy) "supported" as raw bytes — produces noise that scores wrong | Med | ✅ (now rejected with clear error) |
| R4 | No skill extraction from resume text — only matched against job skills | Med | ✅ |

### Security
| # | Issue | Severity | Status |
|---|---|---|---|
| X1 | Upload filter relies on filename extension only — easy bypass | High | ✅ (magic-byte sniffing) |
| X2 | Static `/uploads` served without auth — leaks resumes by ID guess | **Critical** | ✅ (auth-gated route) |
| X3 | bcrypt cost factor 10 — fine, but make explicit & configurable | Low | ✅ |
| X4 | JWT in `localStorage` on the frontend — XSS-stealable | Med | 📝 (documented; cookie-based auth tracked as enhancement) |
| X5 | No CSRF — N/A while we use bearer tokens, not cookies | — | 📝 |
| X6 | Free-text user input echoed in error messages — no sanitization | Low | ✅ |

### Performance
| # | Issue | Severity | Status |
|---|---|---|---|
| P1 | `/api/jobs` capped at 100, no pagination/cursor | High | ✅ |
| P2 | `/api/jobs/:id/applicants` loads everything, filters in JS | High | ✅ |
| P3 | `/api/applications/me` no pagination | Med | ✅ |
| P4 | Recruiter dashboard does 6 parallel queries — fine, kept | — | — |
| P5 | Scoring on request thread (see S5) | High | ✅ |

### Frontend UX / accessibility
| # | Issue | Severity | Status |
|---|---|---|---|
| F1 | No global toast / feedback system — inline status divs everywhere | Med | ✅ |
| F2 | `window.confirm()` for destructive actions — not stylable, not a11y | Med | ✅ |
| F3 | Skeletons exist but only for cards — many pages still spinner-only | Low | 🟡 |
| F4 | Mobile menu not closable with `Esc`, no focus trap | Med | ✅ |
| F5 | Apply / save buttons don't announce success to screen readers | Med | ✅ (toasts have `role="status"`) |
| F6 | No client-side cap on resume size — UX surprise on 11 MB upload | Low | ✅ |
| F7 | Token refresh on 401 not implemented — user sees random logouts | Med | ✅ |

---

## 2. What changed (file-by-file)

### New backend modules
- `backend/src/lib/config.js` — fail-fast env validation at boot
- `backend/src/lib/logger.js` — `pino` structured logger
- `backend/src/lib/errors.js` — typed errors (`ApiError`, `NotFoundError`, …)
- `backend/src/lib/pagination.js` — page/cursor helpers
- `backend/src/lib/sanitize.js` — string sanitization for user-controlled echoes
- `backend/src/middleware/security.js` — helmet + per-route rate limits
- `backend/src/middleware/requestContext.js` — request ID + child logger
- `backend/src/middleware/validate.js` — Zod middleware (body/params/query)
- `backend/src/validation/schemas.js` — every request shape, in one place
- `backend/src/services/atsScoring/{index,normalize,synonyms}.js` and
  `backend/src/services/atsScoring/scorers/{skillScorer,keywordScorer,experienceScorer}.js`
- `backend/src/services/scoringQueue.js` — BullMQ when `REDIS_URL` is set,
  in-process otherwise
- `backend/src/routes/files.routes.js` — auth-gated resume download

### Edited backend
- `backend/package.json` — added `helmet`, `express-rate-limit`, `pino`,
  `pino-http`, `nanoid`, `file-type`, `bullmq`, `ioredis`
- `backend/.env.example` — `REDIS_URL`, `REFRESH_TOKEN_*`, `BCRYPT_COST`
- `backend/src/server.js` — wires all middleware; adds `/api/files/*`;
  graceful shutdown
- `backend/src/lib/jwt.js` — short-lived access + opaque refresh tokens
- `backend/src/middleware/{errorHandler,auth,upload}.js` — consistent envelope,
  MIME sniffing, async-safe
- `backend/src/routes/auth.routes.js` — `/refresh`, `/logout`, password
  policy, validation middleware
- `backend/src/routes/job.routes.js` — pagination, validation middleware,
  pushes resume keyword filter into Postgres
- `backend/src/routes/application.routes.js` — enqueues scoring; pagination
- `backend/src/routes/upload.routes.js` — magic-byte check; enqueues rescore
- `backend/src/services/resumeParser.js` — normalization, fallbacks, skill
  extraction; legacy `.doc` rejected
- `backend/prisma/schema.prisma` — added indexes; `RefreshToken`

### New frontend
- `frontend/src/components/ui/toast.jsx` — accessible provider, `role="status"`
- `frontend/src/components/ui/confirm-dialog.jsx` — focus-trapped modal

### Edited frontend
- `frontend/src/app/layout.jsx` — wraps `ToastProvider`
- `frontend/src/lib/api.js` — auto-refresh on 401, token rotation
- `frontend/src/lib/auth-context.jsx` — uses refresh tokens
- `frontend/src/components/navbar.jsx` — `Esc` closes menu, `aria-current`
- `frontend/src/components/jobs-explorer.jsx` — pagination + cleaner skeletons
- `frontend/src/app/recruiter/jobs/page.jsx` — uses `confirm-dialog` and toasts
- `frontend/src/app/jobs/[id]/page.jsx`, `…/candidate/profile/page.jsx` — toasts

---

## 3. What I deliberately did **not** do

- **Replace JWT-in-localStorage with httpOnly cookies.** It's the right call
  long-term, but the change touches every frontend request and adds CSRF surface.
  Tracked as a follow-up; the audit notes the tradeoff.
- **Move `Job.skills` to a relational table.** Comma-separated is awkward, but
  it works under the current scoring model and there is zero compelling query
  on it today. Defer until we need cross-job analytics.
- **Add a heavy NLP/ML pipeline.** The brief explicitly forbids it; the
  modular scorer + synonyms gets ~80% of the lift for ~5% of the complexity.
- **Add a full-text search column on `Job`.** ILIKE on indexed columns is fine
  at low thousands of rows. We'll switch to `tsvector + GIN` once we cross
  ~50k jobs or query latency exceeds 100 ms.

---

## 4. What's next (ranked, post-deploy)

1. Move auth token to httpOnly cookie + add CSRF (`X4`).
2. `JobSkill` relation (`D4`) — unlocks per-skill analytics.
3. Postgres `tsvector` full-text on `Job.title + description`.
4. Soft-delete (`D5`) and audit log for recruiter actions.
5. S3 (or any object storage) for resumes — current local-disk works for
   single-host but is the next obvious bottleneck.
6. OpenTelemetry traces; Prometheus metrics.
