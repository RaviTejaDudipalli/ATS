# QA Test Plan — ATS

Practical, executable. Every test names what to do, what to look for, and the
expected result. Run the sections in order; earlier sections gate later ones.

---

## Table of Contents

1. [Functional Test Cases](#1-functional-test-cases)
2. [File Upload Test Plan](#2-file-upload-test-plan)
3. [ATS Scoring Validation](#3-ats-scoring-validation)
4. [Performance Tests](#4-performance-tests)
5. [Failure Testing](#5-failure-testing)
6. [Data Validation](#6-data-validation)
7. [Security Testing](#7-security-testing)
8. [Production Readiness Checklist](#8-production-readiness-checklist)
9. [Test execution order (one full pass)](#test-execution-order-for-one-full-pass)

---

## 1. Functional Test Cases

Tooling: a real browser + DevTools (Network + Application → Cookies), plus
`curl` or Postman for the auth/CSRF round-trips.

### 1a. Auth — Candidate

| # | Step | Expected |
|---|---|---|
| 1 | `POST /api/auth/csrf` | Sets `XSRF-TOKEN` cookie (not HttpOnly), returns `{csrfToken}` |
| 2 | Signup with valid candidate payload | 201, sets `ats_at` + `ats_rt` (HttpOnly + Secure in prod), returns user |
| 3 | Signup again with same email | 409 conflict |
| 4 | Signup with password "abc" | 400, validation lists missing rules |
| 5 | Login with wrong password (existing email) | 401, response time roughly equal to login with non-existent email (constant-time) |
| 6 | `GET /api/auth/me` no cookies | 401 |
| 7 | `GET /api/auth/me` with `ats_at` | 200, candidate object including resume relation |
| 8 | Wait for access token to expire (15 min) → call any endpoint | API client transparently calls `/refresh`, retries once, succeeds |
| 9 | Save refresh token, refresh, then send the *old* one again | 401 + log line `refresh token replay detected`, all sessions revoked |
| 10 | Logout | 204, all three cookies cleared, `/me` now 401 |

### 1b. Auth — Recruiter

- Signup without `company` → 400 (`Company is required for recruiters`).
- Login as recruiter → role = `RECRUITER` in JWT.
- Recruiter-only endpoint as candidate → 403.

### 1c. Job creation (recruiter)

| Step | Expected |
|---|---|
| `POST /api/jobs` as candidate | 403 |
| `POST /api/jobs` minus title | 400, field-level error |
| Title 1 char | 400 |
| Description < 10 chars | 400 |
| `minExperience: -3` / `61` | 400 |
| `salaryMin > salaryMax` | Verify the route's intent; currently no validator forbids it. Flag as future fix |
| Skills field `react*, typescript*, node` | Stored as CSV; recruiter sees same after refresh |
| Skills with `\n` and `;` separators | Parsed correctly server-side (verify in scoring breakdown) |
| Edit *another* recruiter's job | 403 / 404 |
| Status `DRAFT` | Job hidden from public `/api/jobs` list |
| Status `OPEN` | Listed publicly |
| Status `CLOSED` | Listed (or filtered, depending on contract) but blocks new applications |

### 1d. Apply to job (candidate)

| Step | Expected |
|---|---|
| Apply with no resume on file | 400/422 with clear error |
| Apply to CLOSED job | 400 |
| Apply twice to same job | 409 (unique constraint) |
| Apply to OPEN job | 201, `atsScore=0`, `scoredAt=null`, queued |
| Wait ~1–3 s, refetch | `scoredAt` is set, `atsScore ∈ [0,100]`, `scoreBreakdown` JSON populated |
| Cover letter 21,000 chars | 400 |

### 1e. Viewing applications

- Candidate `/api/applications`: sees own only, never another candidate's.
- Recruiter `/api/jobs/:id/applicants`:
  - Default sort = score desc → top score first.
  - `sort=date&order=asc` → oldest first.
  - `status=SHORTLISTED` → only those.
  - Pagination: `page=2&perPage=10` returns rows 11–20.
- Recruiter calls another recruiter's job applicants → 403.

### 1f. Dashboard

For a fresh recruiter with 2 jobs and 5 applications:

- Open jobs count = 2.
- Total applications = 5.
- Average score = mean of scored apps (skip `scoredAt=null`).
- Re-run after deleting a job → numbers update.

---

## 2. File Upload Test Plan

Generate the test fixtures once and keep them in `test-fixtures/`. Snippets:

```bash
# Valid files
echo "John Doe React, TypeScript, Node" > valid-small.txt
# Use any real PDF resume → valid-small.pdf

# 11 MB filler (over the 10 MB limit)
dd if=/dev/urandom of=oversize.pdf bs=1M count=11

# Empty
: > empty.pdf

# Corrupted PDF (random bytes with .pdf extension)
dd if=/dev/urandom of=corrupted.pdf bs=1M count=1

# PNG renamed to .pdf
cp some.png mismatch.pdf

# Legacy .doc
echo "junk" > legacy.doc

# Path traversal name
cp valid-small.pdf "../../etc/passwd.pdf"
```

| Case | Expected |
|---|---|
| `valid.pdf` 100 KB | 200, `extractedText` non-empty, `detectedSkills` populated |
| `valid.docx` 200 KB | 200, mammoth parses, no error log |
| `valid.txt` 5 KB | 200 |
| 1 MB / 5 MB / 9 MB PDF | 200 |
| 10 MB exact | 200 (boundary) |
| 11 MB / 20 MB | 413 `payload_too_large` |
| `empty.pdf` (0 B) | 400 from multer/file-type, log "empty file" |
| `corrupted.pdf` | Either 400 (file-type rejects) or 200 with `extractedText=""` and a warn log; **must not 500** |
| `.doc` legacy | 400 `UNSUPPORTED_LEGACY_DOC` |
| PNG renamed `.pdf` | 400 from `file-type` MIME check |
| Zip renamed `.docx` | 400 |
| `script.js` renamed `.pdf` | 400 |
| Image-only PDF (scanned, no text layer) | 200, `extractedText=""`, `detectedSkills=[]`, app score = 0; flag as a known limitation |
| PDF with embedded JS | Parsed safely, **no JS executed**; check process logs for any pdf-parse errors |
| Unicode filename `履歴書.pdf` | 200, original filename stored sanitized |
| Filename `../../etc/passwd.pdf` | Stored under generated UUID/cuid name; original `..` stripped |
| Two-column PDF | `extractedText` row-major (skills appear before next column); confirm by spot-checking |

After every successful upload also verify:

- The file lives at `Resume.storagePath`.
- `Resume.sizeBytes` matches the actual file size on disk.
- `Resume.detectedSkills` is consistent with running `extractSkills()` over the
  stored text.

---

## 3. ATS Scoring Validation

### 3a. Build a fixture matrix

Single recruiter, single job:

```
Title: Senior React Engineer
Description: Looking for an engineer with React, TypeScript, Node, and PostgreSQL.
Skills: react*, typescript*, node, postgres
minExperience: 4
```

Five (then ten) fixture resumes:

| # | Content sketch | Expected |
|---|---|---|
| R1 | 5 yrs React + TS + Node + Postgres, dates 2020–2025 | 80–100; all required matched; recency ≈ 1 |
| R2 | 5 yrs Java + Spring | < 40; both required missing; `requiredMissing=['reactjs','typescript']` |
| R3 | 1 yr React, no TS | Moderate (~30–50); `requiredMissing=['typescript']`; `experience.fit < 1` |
| R4 | "React Native developer" only | Either no hit (token-bounded) or partial; `requiredCoverage` missing reactjs |
| R5 | "I love reaction GIFs" | **0 react match** — verify no false positive |
| R6 | Same as R1 but skill listed 50× in a "Skills" page | Score not materially higher than R1; `breakdown.stuffing.capped > 0` |
| R7 | R1 paraphrased (e.g., "JavaScript UI library by Facebook" instead of "React") | `semantic.similarity` > R2's; rule-based score lower than R1 — confirm semantic catches what rules miss |
| R8 | 8 years total, 7 in C# / .NET, 1 in React | Skill fit moderate; `experience.mismatchPenalty < 1`; final score lower than a 4-yr React specialist |
| R9 | 6 jobs in 5 yrs, each ~10 months | `breakdown.penalties.jobHopping.detected = true`; with `weights.penalty > 0`, final score takes a hit |
| R10 | 4 yrs React with a 2-yr gap (2021–2023) | `careerGaps.detected = true`, gap listed in months |

### 3b. Manual checks per fixture

For each resume, after applying:

```sql
SELECT id, atsScore, scoreBreakdown FROM "Application" WHERE id = '<id>';
```

Verify:

- `breakdown.skillScore + keywordScore + experienceScore` ≈ `score` (allow ±1 from rounding).
- `breakdown.matchedSkills` and `breakdown.missingSkills` partition the requested skill list.
- `breakdown.requiredMissing` ⊆ `breakdown.missingSkills`.
- `breakdown.experienceDetail.relevantYears ≤ totalYears`.
- `breakdown.proficiency[skill] ∈ [0,1]`.
- `breakdown.semantic.similarity ∈ [0,1]`.
- `breakdown.features.values` length = `breakdown.features.names` length, all
  finite.

### 3c. False-positive harness

Run the same job against:

- "I have experience reacting to incidents" → no react match.
- "C# .NET" → matches `csharp` canonical (synonym table).
- "kuberntes" (typo) → fuzzy fallback should canonicalize to `kubernetes`
  (test by inspecting `proficiency` keys).

---

## 4. Performance Tests

Use `k6` (`brew install k6` / `choco install k6`). Throwaway test users,
throwaway DB if possible.

### 4a. Read-heavy endpoints

```js
// k6-jobs.js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 50, duration: '1m' };
export default function () {
  const r = http.get('https://<api>/api/jobs?perPage=20');
  check(r, {
    '200':       (x) => x.status === 200,
    'p95<500ms': (x) => x.timings.duration < 500,
  });
  sleep(1);
}
```

Targets:

- `/api/health`: 200 RPS, p95 < 100 ms.
- `/api/jobs` (public, anonymous): 50 RPS, p95 < 500 ms.
- `/api/auth/me` with valid cookies: 30 RPS, p95 < 400 ms.

### 4b. Resume upload

Test 5 → 10 → 50 concurrent uploads of a 1 MB PDF. Expect:

- 5: all 200, p95 < 3 s.
- 10: all 200, p95 < 6 s.
- 50: free-tier rate limiter (`RATE_LIMIT_UPLOAD_PER_HOUR=20`) starts
  returning 429. **That's correct** — verify the limiter, not absence of
  failures.

### 4c. Scoring throughput

Apply 100 candidates to one job in a tight loop. Measure time from last
enqueue to all `scoredAt != null`.

- With Redis: target ≤ 30 s end-to-end (concurrency 4 in `bullWorker`).
- Without Redis (in-process): expect serial drain ≈ 30–60 s.

### 4d. Dashboard

50 concurrent recruiters hitting `/api/recruiter/dashboard`. Watch DB
connection pool: Prisma defaults to `connection_limit = num_cpus * 2 + 1`. If
you see `Too many connections`, lower it via `?connection_limit=10` in
`DATABASE_URL`.

---

## 5. Failure Testing

Run each scenario, watch backend logs, verify the system degrades gracefully
(no 500 storms, no orphaned data).

### 5a. Redis down

```bash
# Local: kill the Upstash URL by setting REDIS_URL=rediss://invalid:0
```

- Restart server → log line `falling back to in-memory queue`.
- Apply to a job → still works, scoring runs in-process.
- Bring Redis back, restart → BullMQ resumes; backlog from in-process is **not**
  persisted across restarts (document this).

### 5b. Database slow / unreachable

- Pause the Neon compute (dashboard → Stop).
- Hit `/api/jobs`: expect a 500 with the request ID; log shows Prisma timeout.
- Resume Neon compute → next request 200.
- Confirm no inconsistent state: a `POST /api/applications` that failed mid-write
  should leave **no** Application row.

### 5c. Resume parsing fails

- Upload `corrupted.pdf` from §2.
- Expected: HTTP 200 with `extractedText=""`, `detectedSkills=""`. Log shows
  `resume extraction failed` warn.
- Apply to a job → score = 0, application still created.

### 5d. Queue job fails

- Force a failure: temporarily make `runScoreApplication` throw on a specific
  app id.
- BullMQ retries 3× with exponential backoff (already configured).
- After 3 failures: job moves to failed set; log shows `scoring job failed`.
- Application row stays at `atsScore=0, scoredAt=null` — frontend shows
  "scoring…" badge indefinitely.
- **Fix gap**: there's no dead-letter alert path today. Add one before launch
  (UptimeRobot can check a `/api/admin/queue-failures` endpoint).

### 5e. Storage full / write errors

- Fill the upload disk (or revoke write perms) → upload should fail with 500.
  Verify no partial Resume row exists.

---

## 6. Data Validation

After any test run, spot-check directly in Postgres:

```sql
-- 1. No plaintext secrets anywhere
SELECT id, "passwordHash" FROM "User" LIMIT 5;
-- passwordHash MUST start with $2a$ or $2b$, length 60

SELECT id, "tokenHash", "revokedAt" FROM "RefreshToken"
ORDER BY "createdAt" DESC LIMIT 10;
-- tokenHash is 64 hex chars; revoked rows are non-null

-- 2. Refresh-token rotation chain
SELECT id, "userId", "revokedAt", "replacedById"
FROM "RefreshToken" WHERE "userId" = '<u>' ORDER BY "createdAt";
-- All but the latest should be revoked

-- 3. Resume integrity
SELECT id, "fileName", "storagePath", "sizeBytes",
       length("extractedText") AS textlen, "detectedSkills"
FROM "Resume";
-- storagePath must point to an existing file; sizeBytes matches; detectedSkills is a CSV

-- 4. Application invariants
SELECT id, "jobId", "candidateId", "atsScore", "scoredAt", status
FROM "Application";
-- atsScore in [0,100]; status in enum; (jobId,candidateId) is unique (constraint enforced)

-- 5. Score / breakdown consistency
SELECT id, "atsScore",
       ("scoreBreakdown"->>'skillScore')::int +
       ("scoreBreakdown"->>'keywordScore')::int +
       ("scoreBreakdown"->>'experienceScore')::int +
       COALESCE(("scoreBreakdown"->>'semanticScore')::int, 0) AS computed
FROM "Application" WHERE "scoredAt" IS NOT NULL;
-- atsScore ≈ computed (within ±1 due to rounding + penalty multiplier)

-- 6. Orphans / dangling FKs (should be empty)
SELECT a.* FROM "Application" a
LEFT JOIN "Job" j ON j.id = a."jobId" WHERE j.id IS NULL;
SELECT r.* FROM "Resume" r
LEFT JOIN "Candidate" c ON c.id = r."candidateId" WHERE c.id IS NULL;
```

Re-score check: pick one application, re-run `scoreApplication()` in a Node
REPL with the stored resume + job; new score should equal stored `atsScore`
(deterministic).

---

## 7. Security Testing

Treat these as gates before opening signups.

### 7a. File upload

- Magic-byte check via `file-type` (not just extension), verified in §2.
- Size limit enforced server-side, not just client.
- Filenames stored under generated IDs, not user-supplied.
- Uploads served via authenticated `/api/files/resumes/:id`, not directly.
- Add a virus scan path before allowing recruiter download in production
  (ClamAV in a sidecar; out of scope today, log as a follow-up).

### 7b. Auth / RBAC

| Attack | Test | Expect |
|---|---|---|
| Role escalation | Candidate calls `POST /api/jobs` | 403 |
| IDOR | Candidate `GET /api/applications/<other-id>` | 403 / 404 |
| Token reuse | Replay rotated refresh token | 401 + chain revocation log |
| JWT tampering | Edit `role` claim, re-sign with weak secret | Rejected; verify `JWT_SECRET` is 64+ bytes random |
| Mixed-source auth | Send Bearer header AND cookie | Cookie wins (current behavior); both must point to same user, no privilege confusion |
| Password brute force | 25 logins in 15 min | 429 from `authLimiter` |
| Email enumeration | Login with non-existent vs wrong-password | Same body, similar timing (constant-time bcrypt) |

### 7c. CSRF

- POST without `X-CSRF-Token` (with cookies) → 403.
- POST with mismatched cookie + header → 403.
- POST with fabricated token (random, not HMAC-signed) → 403.
- Bearer-token API call without CSRF header → 200 (header path is exempt;
  verify in code review that this is intentional).

### 7d. Cookies in prod

DevTools → Application → Cookies on the deployed site:

- `ats_at`: HttpOnly, Secure, SameSite=None (cross-site) or Lax (same-site).
- `ats_rt`: same flags + Path `/api/auth`.
- `XSRF-TOKEN`: NOT HttpOnly, Secure, SameSite same as above.

### 7e. Injection / XSS

- Cover letter `<script>alert(1)</script>`: stored verbatim; rendered safely
  (React default-escapes). Spot-check in DevTools that no inline script ran.
- Search query `' OR 1=1 --`: Prisma parameterizes; no rows leaked.
- Resume filename with HTML: rendered as text in the recruiter UI.

### 7f. Misc

- `helmet` headers present: `X-Content-Type-Options: nosniff`,
  `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`.
- CORS: `Origin: https://evil.example` → no `Access-Control-Allow-Origin`
  echoed, request blocked.
- No stack traces or DB strings in 500 responses (check `errorHandler`).

---

## 8. Production Readiness Checklist

Run through this top-to-bottom and check off in your repo before opening
signups.

### 8a. Configuration

- [ ] All required env vars set: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
      `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `CORS_ORIGIN`, `COOKIE_SECURE=true`,
      `COOKIE_SAMESITE`.
- [ ] All secrets are 32+ random bytes (regenerate any defaults).
- [ ] `NODE_ENV=production`.
- [ ] `TRUST_PROXY=1` (Render); without it `req.ip` lies and the rate limiter
      mis-keys.
- [ ] `MAX_RESUME_BYTES` matches your storage tier.
- [ ] No `.env` file checked into git.

### 8b. Storage

- [ ] Uploads on persistent storage (Render disk or B2). Confirm by
      redeploying and checking an old resume still resolves.
- [ ] Restore drill executed (see DEPLOYMENT.md §8d). Document the date in
      the runbook.
- [ ] Backups are encrypted (age) and the secret key is offline.
- [ ] Lifecycle rule on the bucket: keep 30 days.

### 8c. Database

- [ ] `npx prisma migrate deploy` runs on every deploy (already in
      `render.yaml`).
- [ ] No seed data in production DB; confirm with
      `SELECT count(*) FROM "User" WHERE email LIKE '%@example.com'`.
- [ ] Connection limit pinned (Prisma URL `?connection_limit=10` for free
      tier).

### 8d. Observability

- [ ] Logs: `LOG_LEVEL=info` in prod; spot-check a request in Render logs and
      confirm the request ID flows through.
- [ ] Health check: cron-job.org pinging `/api/health` every 14 min.
- [ ] Uptime alerts: UptimeRobot on `/api/health` + the frontend root, alerts
      to email.
- [ ] Upstash dashboard pinned: watch the 10 k commands/day cap.
- [ ] A "queue stuck" alert: applications with
      `appliedAt < now() - 10 min` and `scoredAt IS NULL` count > 0.

### 8e. Security

- [ ] Helmet on, CSP planned (currently disabled for the JSON API; fine, but
      front-of-house Vercel should set its own).
- [ ] Rate limits sane: global 300/min, auth 20/15min, upload 20/hr.
- [ ] HTTPS end-to-end (Vercel + Render auto, or Cloudflare full-strict).
- [ ] Security headers inspected with
      `curl -I https://api.<host>/api/health`; confirm HSTS.

### 8f. Hard-to-fake gotchas

- [ ] Render keep-alive scheduled; first real user shouldn't hit a 30-s cold
      start.
- [ ] `COOKIE_SAMESITE=none` requires `COOKIE_SECURE=true`. Config asserts
      this; verify the assert by intentionally misconfiguring once.
- [ ] If frontend and backend are on the same eTLD+1, switch
      `COOKIE_SAMESITE=lax` and set `COOKIE_DOMAIN`. Lax is materially safer.
- [ ] Disabled `crossOriginEmbedderPolicy` and `contentSecurityPolicy` in
      helmet, intentional (JSON API). Re-confirm before launch.
- [ ] Frontend `NEXT_PUBLIC_API_URL` matches the deployed backend exactly (no
      trailing slash).
- [ ] Test logout → login on a *different* device. Cookies should not cross
      devices.

### 8g. Known limitations to communicate

Write these into your runbook so support knows what to say:

- Image-only / scanned PDFs aren't OCR'd; score will be 0.
- Free Render plan sleeps after 15 min idle. First request after a long quiet
  period is slower.
- Free Upstash caps at 10 k commands/day. High-volume hiring sprees may
  transiently fall back to in-process queue.

---

## Test execution order (for one full pass)

1. Auth happy paths (§1a, §1b) — block everything else if broken.
2. File upload matrix (§2) — can't score without resumes.
3. Job + apply flow (§1c, §1d).
4. Scoring fixtures (§3) — run manually, sanity-check breakdown.
5. Performance smoke (§4a, §4b at low VUs).
6. Failure scenarios (§5).
7. Data validation queries (§6) on the resulting state.
8. Security gates (§7).
9. Final pass on the readiness checklist (§8).

Plan one full QA pass per release, plus a fast smoke pass (§1a + §1d + one
fixture from §3) before every deploy.
