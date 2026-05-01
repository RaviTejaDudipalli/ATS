import Link from 'next/link';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { ClipboardCheck, Gauge, Heart, Zap } from 'lucide-react';

const values = [
  {
    icon: Heart,
    title: 'Candidates are people',
    description:
      "Upload once. Apply anywhere. Watch your score update without refreshing the page like it's 2012.",
  },
  {
    icon: Gauge,
    title: 'Scoring that shows its work',
    description:
      'Every resume gets a 0-to-100 score with the receipts: skill match, keyword fit, experience, semantic similarity. No black box, no vibes.',
  },
  {
    icon: Zap,
    title: 'Fast on purpose',
    description:
      'Hayai means fast in Japanese. New applicant to scored shortlist in under a minute. That is the whole pitch.',
  },
  {
    icon: ClipboardCheck,
    title: 'Built for shortlists, not dashboards',
    description:
      "We do not ship metrics theater. We ship fewer mis-hires and shorter loops. Stop scrolling. Start interviewing.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="container-page pt-20">
        <FadeIn>
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge">About</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Hiring is broken. Your ATS isn{"'"}t helping.
            </h1>
            <p className="muted mx-auto mt-5 max-w-2xl text-lg">
              Most applicant tracking systems file resumes. Hayai actually reads them, ranks them, and tells you why.
              Built by a candidate tired of three-month silences, for recruiters with better things to do.
            </p>
          </div>
        </FadeIn>
      </section>

      <section className="container-page py-16">
        <Stagger className="grid gap-6 sm:grid-cols-2">
          {values.map((v) => (
            <StaggerItem key={v.title}>
              <div className="card h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
                  <v.icon size={18} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                <p className="muted mt-1.5 text-sm leading-relaxed">{v.description}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/*
        Stats are wired up but disabled until we have real numbers to show.
        Re-enable by uncommenting this block once the metrics pipeline is live.

      <section className="container-page py-12">
        <FadeIn>
          <div className="card grid gap-8 p-10 sm:grid-cols-3">
            {[
              { k: '0',     d: 'recruiters parsing PDFs by hand' },
              { k: '<60s',  d: 'from new applicant to scored shortlist' },
              { k: '100%',  d: 'of scores you can actually explain' },
            ].map((s) => (
              <div key={s.k} className="text-center">
                <div className="text-4xl font-semibold tracking-tight bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
                  {s.k}
                </div>
                <div className="muted mt-1 text-sm">{s.d}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      */}

      <section className="container-page pb-24">
        <FadeIn>
          <div className="card relative overflow-hidden p-10 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-purple-500/10" />
            <div className="relative">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Less staring at PDFs. More hiring humans.
              </h2>
              <p className="muted mx-auto mt-3 max-w-xl text-sm">
                Try Hayai, or keep using spreadsheets. Your call.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/signup" className="btn-primary">Create your account</Link>
                <Link href="/contact" className="btn-ghost">Talk to me</Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>
    </>
  );
}
