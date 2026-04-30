# Production Deployment Plan — Zero-Cost Stack

End-to-end guide to running the ATS in production on free tiers only. Every
step has commands, configs, and the gotchas you'll hit on free services.

---

## Table of Contents

1. [Recommended free stack](#1-recommended-free-stack)
2. [Architecture overview](#2-architecture-overview)
3. [Step 0 — Accounts to create](#step-0--accounts-to-create)
4. [Step 1 — PostgreSQL on Neon](#step-1--provision-postgresql-on-neon)
5. [Step 2 — Redis on Upstash](#step-2--provision-redis-on-upstash)
6. [Step 3 — Backend on Render](#step-3--deploy-backend-on-render)
   - [3-Alt — Oracle Cloud Always Free VM](#3-alt--oracle-cloud-always-free-vm-no-sleep)
7. [Step 4 — Frontend on Vercel](#step-4--deploy-frontend-on-vercel)
8. [Step 5 — Domain + HTTPS](#step-5--domain--https-optional)
9. [Step 6 — Environment variable reference](#step-6--environment-variable-reference)
10. [Step 7 — CI/CD with GitHub Actions](#step-7--cicd-with-github-actions)
11. [Step 8 — Backup strategy](#step-8--backup-strategy)
12. [Step 9 — Smoke test](#step-9--smoke-test-before-announcing-production)
13. [Step 10 — Monitoring](#step-10--monitoring-free)
14. [Cost recap](#cost-recap)
15. [What to do first](#what-to-do-first)

---

## 1. Recommended free stack

| Layer | Service | Free tier limits | Why this one |
|---|---|---|---|
| Frontend | **Vercel** Hobby | Unlimited projects, 100 GB/mo bandwidth | First-class Next.js host |
| Backend API | **Render** free web service | 750 h/mo, **sleeps after 15 min idle** | Easiest deploy; we work around the sleep |
| PostgreSQL | **Neon** Free | 0.5 GB storage, never auto-pauses on Free, branching | Generous, serverless, supports Prisma cleanly |
| Redis | **Upstash** Free | 256 MB, 10 k commands/day, TLS | Works with BullMQ over `rediss://` |
| CI/CD | **GitHub Actions** | 2000 min/mo on private repos, unlimited public | Native to your repo |
| Object storage (backups) | **Backblaze B2** | 10 GB free, 1 GB/day egress | S3-compatible, no card required |
| DNS / edge | **Cloudflare** Free | Unlimited proxied DNS + auto TLS | Optional, pairs with custom domain |
| Keep-alive | **cron-job.org** | Free cron pings | Defeats Render's 15-min sleep |

> **Stronger free alternative for backend** if Render's cold starts bother you:
> **Oracle Cloud Always Free** gives you a 4-vCPU / 24 GB ARM Ampere VM with
> no sleep, forever. Setup is ~30 min more work (install Node + Caddy
> yourself). This guide covers Render as the default and Oracle as the
> upgrade path in [Step 3-Alt](#3-alt--oracle-cloud-always-free-vm-no-sleep).

---

## 2. Architecture overview

```
                +-----------------------+
                |   Browser (HTTPS)     |
                +-----------+-----------+
                            |
                            v
              +----------------------------+
              |  Vercel (Next.js frontend) |
              |  https://<app>.vercel.app  |
              +-------------+--------------+
                            | fetch (cookies + X-CSRF-Token)
                            v
              +----------------------------+
              |  Render (Express backend)  |
              |  https://<api>.onrender    |
              +---+--------+--------+------+
                  |        |        |
                  v        v        v
        +---------+   +----+----+   +-----------+
        |  Neon   |   | Upstash |   | Backblaze |
        | Postgres|   |  Redis  |   |    B2     |
        +---------+   +---------+   +-----------+
                                          ^
                                          | nightly encrypted dump
                                          |
                                +---------+----------+
                                |  GitHub Actions    |
                                |  (CI + backups)    |
                                +--------------------+
```

---

## Step 0 — Accounts to create

Sign up (no card needed for free tiers) on:

- vercel.com
- render.com
- neon.tech
- upstash.com
- backblaze.com
- cloudflare.com
- github.com
- cron-job.org

Push your repo to GitHub. Both `frontend/` and `backend/` live in the same
monorepo — Vercel and Render both accept a project root path.

---

## Step 1 — Provision PostgreSQL on Neon

1. Neon dashboard → **Create Project** → name `ats`, region closest to your
   backend region, Postgres 16.
2. Copy the connection string (looks like):
   ```
   postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/ats?sslmode=require
   ```
3. **Pooled vs direct**. Neon shows two strings: pooled (port `6543`) and
   direct (port `5432`). Use:
   - **Pooled** for Prisma runtime → `DATABASE_URL`.
   - **Direct** for migrations → `DIRECT_URL`.
4. Update `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```
   Add the `directUrl` line; keep everything else.
5. Run the first migration locally against Neon:
   ```bash
   cd backend
   echo 'DATABASE_URL="<pooled>"'  >  .env
   echo 'DIRECT_URL="<direct>"'    >> .env
   npx prisma migrate deploy
   npm run seed   # optional
   ```

> **Gotcha.** Neon idle compute "scales to zero" after 5 min on Free, then
> takes ~500 ms to wake on the next query. Acceptable for an ATS.

---

## Step 2 — Provision Redis on Upstash

1. Upstash → **Create Database** → name `ats-queue`, type **Global**, TLS on
   (default).
2. Copy the **Redis URL** (starts with `rediss://default:...@...upstash.io:6379`).
   The TLS scheme `rediss://` and port `6379` are critical — BullMQ uses
   ioredis, which respects the URL scheme.
3. Verify locally:
   ```bash
   cd backend
   REDIS_URL="rediss://..." node -e "const R=require('ioredis');const r=new R(process.env.REDIS_URL);r.ping().then(p=>console.log(p)).finally(()=>r.quit())"
   ```
   Expect `PONG`.

> **Gotcha.** 10 k commands/day is enough for a few hundred scoring jobs/day.
> If you outgrow it, drop `REDIS_URL` from the backend env; `scoringQueue.js`
> falls back to its in-process queue automatically.

---

## Step 3 — Deploy backend on Render

### 3a. Add `render.yaml` at repo root

Committing the blueprint means Render rebuilds from spec — clean and
reviewable in PRs.

```yaml
# render.yaml
services:
  - type: web
    name: ats-backend
    runtime: node
    plan: free
    region: oregon            # or 'frankfurt' / 'singapore' — match Neon
    rootDir: backend
    buildCommand: npm ci && npx prisma generate && npx prisma migrate deploy
    startCommand: node src/server.js
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000          # Render injects PORT, but pin for clarity
      - key: TRUST_PROXY
        value: 1               # behind Render's load balancer
      - key: DATABASE_URL
        sync: false            # set in dashboard (secret)
      - key: DIRECT_URL
        sync: false
      - key: REDIS_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      - key: CSRF_SECRET
        generateValue: true
      - key: COOKIE_SAMESITE
        value: none            # frontend on vercel.app != backend on onrender.com
      - key: COOKIE_SECURE
        value: "true"
      - key: CORS_ORIGIN
        sync: false            # set after frontend deploys
```

### 3b. Wire it up in Render

1. Render dashboard → **New** → **Blueprint** → pick your repo. Render reads
   `render.yaml` automatically.
2. Fill in the secret env vars (`DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`).
3. First deploy runs migrations and starts the server. Note the URL:
   `https://ats-backend-xxxx.onrender.com`.
4. Hit `/api/health` from a browser to confirm.

### 3c. Defeat the 15-min sleep

Render's free tier sleeps the dyno after 15 min of no requests. Cold start
is ~30 s. Two fixes:

- **cron-job.org**: create a job pinging
  `https://ats-backend-xxxx.onrender.com/api/health` every **14 minutes**.
  Free, no card.
- Or upgrade backend to Oracle Cloud — see below.

### 3-Alt — Oracle Cloud Always Free VM (no sleep)

If you want zero cold starts, skip Render and host the backend on an Oracle
Cloud Always Free VM (4 OCPU / 24 GB RAM ARM Ampere, free forever).

```bash
# After provisioning a VM.Standard.A1.Flex, Ubuntu 22.04:
ssh ubuntu@<public-ip>

# 1. Install Node 20 + Caddy (auto-HTTPS via Let's Encrypt)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs caddy git

# 2. Pull and build
git clone https://github.com/<you>/ats.git && cd ats/backend
npm ci
npx prisma generate && npx prisma migrate deploy

# 3. Run under systemd
sudo tee /etc/systemd/system/ats-backend.service >/dev/null <<'EOF'
[Unit]
Description=ATS Backend
After=network.target
[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ats/backend
EnvironmentFile=/home/ubuntu/ats/backend/.env.production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now ats-backend

# 4. Caddy as reverse proxy + auto-HTTPS
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
api.your-domain.tld {
  reverse_proxy 127.0.0.1:4000
}
EOF
sudo systemctl reload caddy
```

Open ports 80 + 443 in the Oracle VCN security list. Caddy auto-provisions
Let's Encrypt certs.

---

## Step 4 — Deploy frontend on Vercel

### 4a. Connect repo

1. Vercel → **Add New Project** → import the GitHub repo.
2. **Root directory**: `frontend`.
3. Framework preset: Next.js (auto-detected).
4. **Environment variables** (Project Settings → Environment Variables):
   ```
   NEXT_PUBLIC_API_URL = https://ats-backend-xxxx.onrender.com
   ```
   Set for **Production**, **Preview**, and **Development**.
5. Deploy. You get `https://ats-<hash>.vercel.app`.

### 4b. Wire CORS back into the backend

In the Render dashboard, set:
```
CORS_ORIGIN = https://your-vercel-prod-url.vercel.app
```
Comma-separate multiple if you also want `https://your-domain.tld` later.
Render redeploys automatically on env-var changes.

> **Gotcha.** With cookies + `SameSite=None; Secure` (which we set because
> the two services live on different registrable domains), the browser
> refuses the `Set-Cookie` header without HTTPS. Both Vercel and Render
> serve HTTPS by default — good. If you put a custom domain in front of
> either, make sure it's HTTPS end-to-end (Cloudflare "Full (strict)" mode,
> not "Flexible").

---

## Step 5 — Domain + HTTPS (optional)

**Free path**: just use `*.vercel.app` and `*.onrender.com`. Both include
valid TLS certs. Nothing else to do.

**Custom domain ($8–12/yr at Porkbun or Namecheap — the only real cost in
this plan):**

1. Buy `your-domain.tld`.
2. Move DNS to Cloudflare (free): Cloudflare dashboard → **Add Site** → pick
   Free plan → update nameservers at the registrar.
3. Add records:
   ```
   CNAME  @       cname.vercel-dns.com.            (proxy: OFF for Vercel)
   CNAME  www     cname.vercel-dns.com.            (proxy: OFF)
   CNAME  api     ats-backend-xxxx.onrender.com.   (proxy: OFF)
   ```
   Disable Cloudflare's proxy for Vercel/Render — both terminate TLS
   themselves and the proxy adds a hop that breaks WebSockets and confuses
   cert validation.
4. In Vercel: Project → Domains → add `your-domain.tld` and
   `www.your-domain.tld`.
5. In Render: Service → Settings → Custom Domains → add
   `api.your-domain.tld`.
6. Update env: `CORS_ORIGIN=https://your-domain.tld,https://www.your-domain.tld`
   and `NEXT_PUBLIC_API_URL=https://api.your-domain.tld`.
7. Once both domains share the same eTLD+1, you can switch
   `COOKIE_SAMESITE=lax` and set `COOKIE_DOMAIN=.your-domain.tld` — better
   security than `SameSite=None`.

---

## Step 6 — Environment variable reference

Production env, per service:

```bash
# === Backend (Render or Oracle) ===
NODE_ENV=production
PORT=10000
TRUST_PROXY=1

DATABASE_URL=postgresql://...neon.tech/ats?sslmode=require   # pooled
DIRECT_URL=postgresql://...neon.tech/ats?sslmode=require     # direct
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379           # optional

JWT_SECRET=<64-byte random>
JWT_REFRESH_SECRET=<different 64-byte random>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
BCRYPT_COST=12

CSRF_SECRET=<32-byte random>
COOKIE_SAMESITE=none           # 'lax' if same eTLD+1
COOKIE_SECURE=true
# COOKIE_DOMAIN=.your-domain.tld   # only with custom domain

CORS_ORIGIN=https://your-domain.tld,https://www.your-domain.tld
LOG_LEVEL=info
UPLOAD_DIR=/var/data/uploads     # Render: persistent disk; Oracle: any path
MAX_RESUME_BYTES=10485760

# === Frontend (Vercel) ===
NEXT_PUBLIC_API_URL=https://api.your-domain.tld
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Resume uploads on free tiers

Render free tier filesystems are ephemeral — files vanish on redeploy. Two
options:

- **Persistent disk on Render** (1 GB included on free): mount at
  `/var/data` and set `UPLOAD_DIR=/var/data/uploads`.
- **Backblaze B2** (S3-compatible) — better for production. Use
  `@aws-sdk/client-s3` pointed at the B2 endpoint. `resumeParser.js` already
  abstracts the read path; swap `fs.readFile` for `s3.getObject`. Out of
  scope for this guide but worth a follow-up.

---

## Step 7 — CI/CD with GitHub Actions

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ats_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ats_test
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/ats_test
      JWT_SECRET: ci-secret-ci-secret-ci-secret
      JWT_REFRESH_SECRET: ci-refresh-ci-refresh-ci-refresh
      CSRF_SECRET: ci-csrf-ci-csrf-ci-csrf
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: node -e "require('./src/lib/config')"   # config validation smoke test
      # - run: npm test                                # add when you have tests

  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          NEXT_PUBLIC_API_URL: https://api.example.invalid    # build-only placeholder
```

### Deploys

The deploys themselves do not need a workflow:

- **Vercel**: connected repo auto-deploys on every push to `main` and
  creates preview URLs for PRs.
- **Render**: same, via `autoDeploy: true` in `render.yaml`.

CI's job is to block bad merges. Vercel + Render handle delivery.

---

## Step 8 — Backup strategy

Daily encrypted Postgres dumps, pushed to Backblaze B2.

### 8a. Set up Backblaze

1. B2 → **Create Bucket** → `ats-backups` → Private.
2. **Application Keys** → New key, scoped to that bucket → save `keyId`,
   `applicationKey`, and the bucket's `endpoint`
   (e.g. `s3.us-west-004.backblazeb2.com`).

### 8b. Create the workflow

`.github/workflows/backup.yml`:

```yaml
name: Backup database

on:
  schedule: [{ cron: '17 3 * * *' }]    # 03:17 UTC daily — off-peak
  workflow_dispatch:

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - name: Install postgres client + age
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client age
      - name: Dump
        env:
          DATABASE_URL: ${{ secrets.NEON_DIRECT_URL }}
        run: |
          STAMP=$(date -u +%Y%m%dT%H%M%SZ)
          pg_dump --no-owner --no-privileges --format=custom \
            "$DATABASE_URL" > "ats-$STAMP.dump"
          echo "DUMP_FILE=ats-$STAMP.dump" >> "$GITHUB_ENV"
      - name: Encrypt with age
        env:
          AGE_RECIPIENT: ${{ secrets.AGE_RECIPIENT }}    # age public key
        run: age -r "$AGE_RECIPIENT" -o "$DUMP_FILE.age" "$DUMP_FILE" && rm "$DUMP_FILE"
      - name: Upload to Backblaze B2
        uses: shallwefootball/s3-upload-action@v1.3.3
        with:
          aws_key_id:     ${{ secrets.B2_KEY_ID }}
          aws_secret_access_key: ${{ secrets.B2_APP_KEY }}
          aws_bucket:     ats-backups
          source_dir:     .
          destination_dir: dumps
          endpoint:       ${{ secrets.B2_ENDPOINT }}     # https://s3.us-west-004.backblazeb2.com
      - name: Prune local
        run: rm -f *.age
```

GitHub repo secrets to set:

- `NEON_DIRECT_URL`
- `AGE_RECIPIENT`
- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_ENDPOINT`

### 8c. Generate the age key (once, locally)

```bash
# Install age: https://github.com/FiloSottile/age
age-keygen -o ats-backup.key
# ats-backup.key contains the secret. KEEP IT OFFLINE (1Password / paper).
# The first line in that file is the public key — paste into AGE_RECIPIENT.
```

The encrypted dumps are useless to anyone who steals your B2 key without
the age secret.

### 8d. Restore drill

Run this once, immediately after the first backup, against a throwaway
database — a backup you've never restored is wishful thinking:

```bash
age -d -i ats-backup.key ats-20260501T031701Z.dump.age | \
  pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL"
```

### 8e. Retention

Backblaze has **Lifecycle Rules** in the bucket UI: configure `keep last 30
days`. Don't let 10 GB fill up — age-encrypted custom-format dumps for an
ATS DB run ~50–500 KB, so a year of dailies is well under a GB.

### 8f. Bonus: Neon point-in-time recovery

Neon Free has **7-day branch-based PITR**: in the dashboard, branch from any
timestamp in the last week. That's your *fast* recovery path; Backblaze is
your *long-term* and *off-provider* recovery.

---

## Step 9 — Smoke test before announcing "production"

```bash
# 1. Health
curl -sS https://api.your-domain.tld/api/health
# {"status":"ok","service":"ats-backend",...}

# 2. CSRF cookie issuance
curl -i -c jar.txt https://api.your-domain.tld/api/auth/csrf | grep -i set-cookie
# Set-Cookie: XSRF-TOKEN=...; Path=/; Secure; SameSite=None

# 3. Round-trip: signup → me, with cookies
CSRF=$(grep XSRF-TOKEN jar.txt | awk '{print $7}')
curl -sS -b jar.txt -c jar.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"smoke@test.com","password":"TestPass1","role":"CANDIDATE","fullName":"Smoke Test"}' \
  https://api.your-domain.tld/api/auth/signup

curl -sS -b jar.txt https://api.your-domain.tld/api/auth/me
# {"user":{"id":"...","email":"smoke@test.com",...}}

# 4. Frontend
open https://your-domain.tld
# Sign up via the UI; in DevTools → Application → Cookies, confirm
# ats_at + ats_rt are HttpOnly + Secure.
```

---

## Step 10 — Monitoring (free)

- **Render**: built-in logs + metrics dashboard.
- **Vercel**: built-in analytics + logs (last 1 h on Hobby; persist longer
  via `vercel logs --since=1h`).
- **Uptime**: cron-job.org's job history doubles as an uptime log. For
  proper alerting, **UptimeRobot Free** gives 50 monitors, 5-min interval,
  email alerts.
- **Neon**: dashboard shows query throughput + storage.
- **Upstash**: dashboard shows commands/day so you can see when you're
  approaching the 10 k/day cap.

---

## Cost recap

Everything in this plan is **$0/mo** if you use the free Vercel and Render
subdomains.

If you buy a custom domain it's **~$10/yr** (Porkbun) — the only line item.

---

## What to do first

1. **Today**:
   - Step 1 (Neon) + Step 2 (Upstash) + Step 3 (Render) — get the backend live.
   - Step 4 (Vercel) — get the frontend live.
2. **This week**:
   - Step 7 (CI) + Step 8 (Backups) + cron-job.org keep-alive.
   - Run the restore drill (Step 8d) against a throwaway DB.
3. **When you have $10**:
   - Step 5 (custom domain) and switch `COOKIE_SAMESITE=lax`.
