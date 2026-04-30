'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import JobForm from '@/components/job-form';
import { Skeleton } from '@/components/ui/skeleton';
import { FadeIn } from '@/components/ui/motion';
import { api } from '@/lib/api';

function EditJobInner() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(`/api/jobs/${id}`)
      .then((d) => { if (alive) setJob(d.job); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  async function onSubmit(payload) {
    await api.put(`/api/jobs/${id}`, payload);
    router.push('/recruiter/jobs');
  }

  return (
    <section className="container-page py-10">
      <Link href="/recruiter/jobs" className="muted inline-flex items-center gap-1 text-sm hover:text-current">
        <ArrowLeft size={14} /> Back to jobs
      </Link>
      <FadeIn>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Edit job</h1>
        <p className="muted mt-1">Tweak title, description, salary, skills, and status.</p>
      </FadeIn>

      {error && <div className="card mt-6 p-6 text-rose-500">{error}</div>}

      <div className="mt-6 max-w-3xl">
        {!job && !error ? (
          <Skeleton className="h-96 w-full" />
        ) : job ? (
          <JobForm
            initial={{
              title: job.title,
              description: job.description,
              location: job.location || '',
              remote: job.remote,
              type: job.type,
              status: job.status,
              salaryMin: job.salaryMin ?? '',
              salaryMax: job.salaryMax ?? '',
              currency: job.currency || 'USD',
              skills: job.skills || '',
              minExperience: job.minExperience ?? '',
            }}
            onSubmit={onSubmit}
            submitLabel="Save changes"
          />
        ) : null}
      </div>
    </section>
  );
}

export default function Page() {
  return <AuthGate role="RECRUITER"><EditJobInner /></AuthGate>;
}
