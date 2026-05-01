# ATS — Applicant Tracking System

A production-ready, full-stack Applicant Tracking System with a modern company website. Hope the below content is helpful.

- **Frontend** — Next.js 14 (App Router), Tailwind CSS, Framer Motion
- **Backend** — Node.js, Express, Prisma, PostgreSQL
- **Auth** — JWT (role-based: candidate / recruiter)
- **Storage** — Local disk (S3-ready abstraction)
- **ATS Scoring** — Keyword + experience matching against job descriptions

## Project layout

```
ATS/
├─ backend/          Express API + Prisma + ATS scoring engine
├─ frontend/         Next.js app (website + dashboards)
└─ README.md
```

## Quick start

### 1. Database

Install PostgreSQL 14+ and create a database:

```sql
CREATE DATABASE ats;
```

### 2. Backend

```bash
cd backend
cp .env.example .env       # edit DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npm install
npx prisma migrate dev --name init      # first time
# (after pulling the production-upgrade pass) re-run:
# npx prisma migrate dev --name production_upgrades
npm run seed               # creates demo recruiter + jobs
npm run dev                # http://localhost:4000
```

Optional: set `REDIS_URL` to enable the BullMQ-backed scoring queue.
Without it, scoring runs in-process via `setImmediate` — fine for dev /
single-instance deployments.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                # http://localhost:3000
```

### Demo accounts

After running `npm run seed`:

| Role      | Email                  | Password    |
|-----------|------------------------|-------------|
| Recruiter | recruiter@demo.com     | Recruiter#1 |
| Candidate | candidate@demo.com     | Candidate#1 |

## Features

### Candidate
- Sign up / log in
- Profile + resume upload (PDF / DOC / DOCX / TXT)
- Browse jobs, apply, track applications, filter by status / date

### Recruiter
- Dashboard analytics (applicants, active roles, recent applications)
- Create / edit / delete jobs
- View applicants per job with ATS score, sort & filter

### ATS Scoring
- Resume text extraction (`pdf-parse` / `mammoth` / plain text)
- Keyword + skill + experience matching against the job description
- Returns a 0–100 score with a breakdown

### UI / UX
- Responsive (mobile + desktop)
- Dark mode toggle (persisted)
- Framer Motion page transitions, fades, hover scaling
- Glassmorphism navbar, gradient accents, skeleton loaders
