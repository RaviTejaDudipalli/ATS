'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Users, Activity, Plus, ArrowRight } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import StatCard from '@/components/ui/stat-card';
import EmptyState from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import ScoreRing from '@/components/ui/score-ring';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { api } from '@/lib/api';
import { formatDate, statusBadgeClass, statusLabel, jobTypeLabel } from '@/lib/format';

const statusColors = {
  APPLIED: 'bg-brand-500',
  REVIEWING: 'bg-amber-500',
  SHORTLISTED: 'bg-purple-500',
  INTERVIEW: 'bg-cyan-500',
  REJECTED: 'bg-rose-500',
  HIRED: 'bg-emerald-500',
};

function PipelineBar({ byStatus }) {
  const order = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED'];
  const total = order.reduce((s, k) => s + (byStatus[k] || 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {order.map((k) => {
          const v = byStatus[k] || 0;
          if (!v) return null;
          return <div key={k} className={`${statusColors[k]} transition-all`} style={{ width: `${(v / total) * 100}%` }} title={`${statusLabel(k)}: ${v}`} />;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {order.map((k) => (
          <span key={k} className="muted inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${statusColors[k]}`} /> {statusLabel(k)} ({byStatus[k] || 0})
          </span>
        ))}
      </div>
    </div>
  );
}

function RecruiterDashboardInner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get('/api/recruiter/dashboard')
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="container-page py-10">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Recruiter dashboard</h1>
            <p className="muted mt-1">An overview of your roles, pipeline and recent applications.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/recruiter/jobs" className="btn-ghost">All jobs</Link>
            <Link href="/recruiter/jobs/new" className="btn-primary"><Plus size={16} /> New job</Link>
          </div>
        </div>
      </FadeIn>

      {error && <div className="card mt-6 p-6 text-rose-500">{error}</div>}

      {!data && !error && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {data && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Active roles" value={data.stats.openJobs} icon={Briefcase} />
            <StatCard label="Total applicants" value={data.stats.totalApplicants} icon={Users} accent="from-emerald-500 to-teal-500" />
            <StatCard label="All-time roles" value={data.stats.totalJobs} icon={Activity} accent="from-amber-500 to-rose-500" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2 p-6">
              <h3 className="text-lg font-semibold">Pipeline</h3>
              <p className="muted mt-1 text-sm">Applications across your active roles.</p>
              <div className="mt-5">
                <PipelineBar byStatus={data.byStatus || {}} />
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wider muted">Recent applications</h4>
                  <Link href="/recruiter/jobs" className="text-sm text-brand-600">View all <ArrowRight size={14} className="inline" /></Link>
                </div>
                {data.recentApplications.length === 0 ? (
                  <p className="muted mt-4 text-sm">No applications yet.</p>
                ) : (
                  <Stagger className="mt-4 divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
                    {data.recentApplications.map((a) => (
                      <StaggerItem key={a.id}>
                        <div className="flex items-center gap-4 py-3">
                          <ScoreRing score={a.atsScore} size={42} stroke={4} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{a.candidate.fullName}</div>
                            <div className="muted truncate text-xs">{a.candidate.user.email}</div>
                          </div>
                          <Link href={`/recruiter/jobs/${a.job.id}/applicants`} className="muted hidden truncate text-sm hover:text-current sm:block">
                            {a.job.title}
                          </Link>
                          <span className={`badge ${statusBadgeClass(a.status)}`}>{statusLabel(a.status)}</span>
                          <span className="muted hidden text-xs sm:block">{formatDate(a.appliedAt)}</span>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold">Your jobs</h3>
              {data.jobs.length === 0 ? (
                <EmptyState
                  title="No jobs yet"
                  description="Create your first role and start collecting applicants."
                  action={<Link href="/recruiter/jobs/new" className="btn-primary"><Plus size={16} /> New job</Link>}
                />
              ) : (
                <ul className="mt-4 space-y-2">
                  {data.jobs.slice(0, 6).map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/recruiter/jobs/${j.id}/applicants`}
                        className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{j.title}</div>
                          <div className="muted text-xs">
                            {jobTypeLabel(j.type)} · {statusLabel(j.status)}
                          </div>
                        </div>
                        <span className="badge">{j._count.applications}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function Page() {
  return <AuthGate role="RECRUITER"><RecruiterDashboardInner /></AuthGate>;
}
