'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import JobCard from '@/components/ui/job-card';
import { JobCardSkeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import Pagination from '@/components/ui/pagination';
import { Stagger, StaggerItem } from '@/components/ui/motion';

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

export default function JobsExplorer() {
  const [jobs, setJobs] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Reset to page 1 when filters change so we don't land on an empty page.
  useEffect(() => { setPage(1); }, [q, type, remoteOnly]);

  useEffect(() => {
    let alive = true;
    setError(null);
    const params = new URLSearchParams({ page: String(page), perPage: '12' });
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (remoteOnly) params.set('remote', 'true');
    api.get(`/api/jobs?${params.toString()}`)
      .then((data) => {
        if (!alive) return;
        setJobs(data.jobs);
        setPagination(data.pagination);
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [q, type, remoteOnly, page]);

  const loading = jobs === null && !error;
  const list = jobs || [];
  const empty = !loading && list.length === 0;

  const subtitle = useMemo(() => {
    if (loading) return 'Loading roles…';
    if (error) return error;
    if (pagination?.total != null) {
      return `${pagination.total} role${pagination.total === 1 ? '' : 's'} available`;
    }
    return `${list.length} role${list.length === 1 ? '' : 's'} available`;
  }, [loading, error, list.length, pagination]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 muted" aria-hidden />
          <label htmlFor="job-search" className="sr-only">Search jobs</label>
          <input
            id="job-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search roles, skills, locations…"
            className="input pl-10"
          />
        </div>
        <label className="sr-only" htmlFor="job-type">Job type</label>
        <select id="job-type" className="select max-w-[180px]" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'rgb(var(--border))' }}>
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
          Remote only
        </label>
      </div>

      <p className="muted mb-4 text-sm" aria-live="polite">{subtitle}</p>

      {loading && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
      )}

      {!loading && empty && (
        <EmptyState
          title="No matching roles yet"
          description="Try a different keyword, or check back soon. New roles get posted weekly."
        />
      )}

      {!loading && list.length > 0 && (
        <>
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((job) => (
              <StaggerItem key={job.id}>
                <JobCard job={job} />
              </StaggerItem>
            ))}
          </Stagger>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}
