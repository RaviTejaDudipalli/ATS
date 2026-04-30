'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Mail, Phone, Filter, Search } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import ScoreRing from '@/components/ui/score-ring';
import Pagination from '@/components/ui/pagination';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { api, downloadProtected } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, statusBadgeClass, statusLabel } from '@/lib/format';

const STATUSES = ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'HIRED'];

function ApplicantsInner() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  const [sort, setSort] = useState('score');
  const [order, setOrder] = useState('desc');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({
      sort,
      order,
      page: String(page),
      perPage: '20',
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
    });
    try {
      const d = await api.get(`/api/jobs/${id}/applicants?${params.toString()}`);
      setData(d);
    } catch (err) {
      setError(err.message);
    }
  }, [id, sort, order, status, q, page]);

  useEffect(() => {
    const t = setTimeout(refresh, 200);
    return () => clearTimeout(t);
  }, [refresh]);

  // Reset to page 1 whenever filters change so we don't land on an empty page.
  useEffect(() => { setPage(1); }, [sort, order, status, q]);

  async function setApplicationStatus(applicationId, newStatus) {
    try {
      await api.patch(`/api/applications/${applicationId}/status`, { status: newStatus });
      toast.success('Status updated');
      await refresh();
    } catch (err) {
      toast.error('Could not update status', err.message);
    }
  }

  function openResume(resumeId, fileName) {
    downloadProtected(`/api/files/resumes/${resumeId}`, { filename: fileName }).catch((err) =>
      toast.error('Could not open resume', err.message),
    );
  }

  return (
    <section className="container-page py-10">
      <Link href="/recruiter/jobs" className="muted inline-flex items-center gap-1 text-sm hover:text-current">
        <ArrowLeft size={14} /> Back to jobs
      </Link>

      {error && <div className="card mt-6 p-6 text-rose-500">{error}</div>}

      {!data && !error && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {data && (
        <>
          <FadeIn>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{data.job.title}</h1>
            <p className="muted mt-1">{data.applications.length} applicants · sorted by {sort === 'score' ? 'ATS score' : 'date'}</p>
          </FadeIn>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 muted" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search resume text, name, email…"
                className="input pl-10"
              />
            </div>
            <span className="muted inline-flex items-center gap-1 text-sm"><Filter size={14} /> Status</span>
            <select className="select max-w-[170px]" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select className="select max-w-[160px]" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="score">Sort by score</option>
              <option value="date">Sort by date</option>
            </select>
            <select className="select max-w-[140px]" value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>

          {data.applications.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                title="No applicants match"
                description="Try clearing your filters or wait for fresh applications."
              />
            </div>
          ) : (<>

            <Stagger className="mt-6 space-y-4">
              {data.applications.map((a) => {
                const breakdown = a.scoreBreakdown || {};
                return (
                  <StaggerItem key={a.id}>
                    <div className="card p-5">
                      <div className="flex flex-wrap items-start gap-5">
                        <div className="relative">
                          <ScoreRing score={a.atsScore} size={64} />
                          {!a.scoredAt && (
                            <span
                              className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                              aria-label="Resume score is being computed"
                            >
                              scoring…
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">{a.candidate.fullName}</h3>
                            <span className={`badge ${statusBadgeClass(a.status)}`}>{statusLabel(a.status)}</span>
                          </div>
                          <div className="muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="inline-flex items-center gap-1"><Mail size={14} /> {a.candidate.user.email}</span>
                            {a.candidate.phone && <span className="inline-flex items-center gap-1"><Phone size={14} /> {a.candidate.phone}</span>}
                            <span>Applied {formatDateTime(a.appliedAt)}</span>
                          </div>

                          {breakdown.matchedSkills?.length || breakdown.missingSkills?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(breakdown.matchedSkills || []).slice(0, 8).map((s) => (
                                <span key={`m-${s}`} className="badge badge-success">✓ {s}</span>
                              ))}
                              {(breakdown.missingSkills || []).slice(0, 6).map((s) => (
                                <span key={`x-${s}`} className="badge badge-muted">{s}</span>
                              ))}
                            </div>
                          ) : null}

                          {a.coverLetter && (
                            <details className="mt-3">
                              <summary className="muted cursor-pointer text-sm">Cover letter</summary>
                              <p className="muted mt-2 whitespace-pre-line text-sm leading-relaxed">{a.coverLetter}</p>
                            </details>
                          )}
                        </div>

                        <div className="flex flex-col items-stretch gap-2">
                          {a.candidate.resume && (
                            <button
                              type="button"
                              onClick={() => openResume(a.candidate.resume.id, a.candidate.resume.fileName)}
                              className="btn-ghost"
                              aria-label={`Download ${a.candidate.fullName}'s resume`}
                            >
                              <Download size={14} /> Resume
                            </button>
                          )}
                          <select
                            className="select"
                            value={a.status}
                            onChange={(e) => setApplicationStatus(a.id, e.target.value)}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                        <div className="rounded-xl border p-2.5" style={{ borderColor: 'rgb(var(--border))' }}>
                          <div className="muted">Skills</div>
                          <div className="mt-0.5 font-semibold">
                            {breakdown.skillScore ?? 0}/{breakdown.weights?.skill ?? 50}
                          </div>
                        </div>
                        <div className="rounded-xl border p-2.5" style={{ borderColor: 'rgb(var(--border))' }}>
                          <div className="muted">Keywords</div>
                          <div className="mt-0.5 font-semibold">
                            {breakdown.keywordScore ?? 0}/{breakdown.weights?.keyword ?? 30}
                          </div>
                        </div>
                        <div className="rounded-xl border p-2.5" style={{ borderColor: 'rgb(var(--border))' }}>
                          <div className="muted">Experience</div>
                          <div className="mt-0.5 font-semibold">
                            {breakdown.experienceScore ?? 0}/{breakdown.weights?.experience ?? 20}
                          </div>
                        </div>
                      </div>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
            <Pagination pagination={data.pagination} onChange={setPage} />
          </>)}
        </>
      )}
    </section>
  );
}

export default function Page() {
  return <AuthGate role="RECRUITER"><ApplicantsInner /></AuthGate>;
}
