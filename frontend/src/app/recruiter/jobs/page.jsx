'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import EmptyState from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api';
import { formatDate, statusLabel, jobTypeLabel } from '@/lib/format';

function JobsListInner() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function refresh() {
    setError(null);
    try {
      const d = await api.get('/api/recruiter/dashboard');
      setData(d);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onDelete(job) {
    const ok = await confirm({
      title: `Delete "${job.title}"?`,
      description:
        `This permanently removes the job and ${job._count.applications} application(s). This cannot be undone.`,
      confirmLabel: 'Delete job',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/jobs/${job.id}`);
      toast.success('Job deleted', `"${job.title}" was removed.`);
      await refresh();
    } catch (err) {
      toast.error('Could not delete job', err.message);
    }
  }

  return (
    <section className="container-page py-10">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">All jobs</h1>
            <p className="muted mt-1">Manage every role you've published.</p>
          </div>
          <Link href="/recruiter/jobs/new" className="btn-primary"><Plus size={16} /> New job</Link>
        </div>
      </FadeIn>

      {error && <div className="card mt-6 p-6 text-rose-500">{error}</div>}

      {!data && !error && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {data && data.jobs.length === 0 && (
        <div className="mt-10">
          <EmptyState
            title="No jobs yet"
            description="Publish your first role to start receiving applications."
            action={<Link href="/recruiter/jobs/new" className="btn-primary"><Plus size={16} /> New job</Link>}
          />
        </div>
      )}

      {data && data.jobs.length > 0 && (
        <Stagger className="mt-8 space-y-3">
          {data.jobs.map((j) => (
            <StaggerItem key={j.id}>
              <div className="card flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{jobTypeLabel(j.type)}</span>
                    <span className={`badge ${j.status === 'OPEN' ? 'badge-success' : j.status === 'CLOSED' ? 'badge-danger' : 'badge-warning'}`}>{statusLabel(j.status)}</span>
                    {j.remote && <span className="badge badge-muted">Remote</span>}
                  </div>
                  <Link href={`/recruiter/jobs/${j.id}/applicants`} className="mt-1 block text-lg font-semibold hover:text-brand-600">
                    {j.title}
                  </Link>
                  <div className="muted mt-0.5 text-sm">
                    {j._count.applications} applicants · Posted {formatDate(j.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/recruiter/jobs/${j.id}/applicants`} className="btn-ghost"><Users size={14} /> Applicants</Link>
                  <Link href={`/recruiter/jobs/${j.id}/edit`} className="btn-ghost"><Pencil size={14} /> Edit</Link>
                  <button
                    type="button"
                    onClick={() => onDelete(j)}
                    aria-label={`Delete ${j.title}`}
                    className="btn-ghost text-rose-500 hover:text-rose-500"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

export default function Page() {
  return <AuthGate role="RECRUITER"><JobsListInner /></AuthGate>;
}
