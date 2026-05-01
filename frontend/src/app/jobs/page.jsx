import { FadeIn } from '@/components/ui/motion';
import JobsExplorer from '@/components/jobs-explorer';

export const dynamic = 'force-dynamic';

export default function JobsPage() {
  return (
    <>
      <section className="container-page pt-16">
        <FadeIn>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">All jobs</h1>
          <p className="muted mt-2">Explore every open role on Hayai.</p>
        </FadeIn>
      </section>
      <section className="container-page py-10">
        <JobsExplorer />
      </section>
    </>
  );
}
