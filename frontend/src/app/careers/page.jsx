import Link from 'next/link';
import { FadeIn } from '@/components/ui/motion';
import JobsExplorer from '@/components/jobs-explorer';

export const dynamic = 'force-dynamic';

export default function CareersPage() {
  return (
    <>
      <section className="container-page pt-20">
        <FadeIn>
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge">Careers</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Open roles
            </h1>
            <p className="muted mx-auto mt-5 max-w-2xl text-lg">
              Join a small team building the hiring tools we wish we had had ourselves.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link href="/signup?role=candidate" className="btn-primary">Create candidate account</Link>
              <Link href="/jobs" className="btn-ghost">All jobs</Link>
            </div>
          </div>
        </FadeIn>
      </section>

      <section className="container-page py-16">
        <JobsExplorer />
      </section>
    </>
  );
}
