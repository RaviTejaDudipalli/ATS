'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Briefcase, FileText, Sparkles, Filter, ArrowRight } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import StatCard from '@/components/ui/stat-card';
import EmptyState from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import ScoreRing from '@/components/ui/score-ring';
import { Stagger, StaggerItem, FadeIn } from '@/components/ui/motion';
import { api } from '@/lib/api';
import { formatDate, statusBadgeClass, statusLabel } from '@/lib/format';

const STATUSES = ['', 'APPLIED', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'HIRED'];

function CandidateDashboardInner() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    let alive = true;
    setError(null);
    const params = new URLSearchParams({
      sort,
      order,
      perPage: '50',
      ...(status ? { status } : {}),
    });
    api.get(`/api/applications/me?${params.toString()}`)
      .then((d) => { if (alive) setApps(d.applications); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [status, sort, order]);

  const stats = useMemo(() => {
    const list = apps || [];
    const active = list.filter((a) => !['REJECTED', 'HIRED'].includes(a.status)).length;
    const avg = list.length ? Math.round(list.reduce((s, a) => s + a.atsScore, 0) / list.length) : 0;
    return { total: list.length, active, avg };
  }, [apps]);

  return (
    <section className="container-page py-10">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your applications</h1>
            <p className="muted mt-1">Track every role you've applied to and see your match score.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/candidate/profile" className="btn-ghost">Profile & resume</Link>
            <Link href="/jobs" className="btn-primary">Browse jobs <ArrowRight size={16} /></Link>
          </div>
        </div>
      </FadeIn>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Applications" value={stats.total} icon={Briefcase} />
        <StatCard label="Active" value={stats.active} icon={Sparkles} accent="from-emerald-500 to-teal-500" />
        <StatCard label="Avg. ATS score" value={`${stats.avg}/100`} icon={FileText} accent="from-amber-500 to-rose-500" />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="muted inline-flex items-center gap-1 text-sm"><Filter size={14} /> Filter</span>
        <select className="select max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : 'All statuses'}</option>)}
        </select>
        <select className="select max-w-[160px]" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">Sort by date</option>
          <option value="score">Sort by score</option>
        </select>
        <select className="select max-w-[140px]" value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      <div className="mt-6 space-y-4">
        {error && <div className="card p-6 text-rose-500">{error}</div>}

        {apps === null && !error && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {apps && apps.length === 0 && (
          <EmptyState
            title="No applications yet"
            description="Browse open roles and apply with one click — your score updates instantly."
            action={<Link href="/jobs" className="btn-primary">Browse jobs</Link>}
          />
        )}

        {apps && apps.length > 0 && (
          <Stagger className="space-y-3">
            {apps.map((a) => (
              <StaggerItem key={a.id}>
                <div className="card flex flex-wrap items-center gap-5 p-5">
                  <div className="relative">
                    <ScoreRing score={a.atsScore} />
                    {!a.scoredAt && (
                      <span
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                        aria-label="Score pending"
                      >
                        scoring…
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${a.job.id}`} className="text-lg font-semibold hover:text-brand-600">
                      {a.job.title}
                    </Link>
                    <div className="muted mt-0.5 text-sm">
                      {a.job.recruiter?.company || '—'} · Applied {formatDate(a.appliedAt)}
                    </div>
                  </div>
                  <span className={`badge ${statusBadgeClass(a.status)}`}>{statusLabel(a.status)}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <AuthGate role="CANDIDATE">
      <CandidateDashboardInner />
    </AuthGate>
  );
}
