'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import JobForm from '@/components/job-form';
import { FadeIn } from '@/components/ui/motion';
import { api } from '@/lib/api';

function NewJobInner() {
  const router = useRouter();

  async function onSubmit(payload) {
    const data = await api.post('/api/jobs', payload);
    router.push(`/recruiter/jobs/${data.job.id}/applicants`);
  }

  return (
    <section className="container-page py-10">
      <Link href="/recruiter/jobs" className="muted inline-flex items-center gap-1 text-sm hover:text-current">
        <ArrowLeft size={14} /> Back to jobs
      </Link>
      <FadeIn>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">New job</h1>
        <p className="muted mt-1">Publish a role and start receiving scored applications.</p>
      </FadeIn>
      <div className="mt-6 max-w-3xl">
        <JobForm onSubmit={onSubmit} submitLabel="Publish job" />
      </div>
    </section>
  );
}

export default function Page() {
  return <AuthGate role="RECRUITER"><NewJobInner /></AuthGate>;
}
