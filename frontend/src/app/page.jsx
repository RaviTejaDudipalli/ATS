import Link from 'next/link';
import { ArrowRight, Sparkles, Gauge, Users, FileSearch, Shield, Zap } from 'lucide-react';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';

const features = [
  {
    icon: Gauge,
    title: 'Built-in ATS scoring',
    description:
      'Each application is scored against the role with a transparent breakdown of skill, keyword, and experience matches.',
  },
  {
    icon: FileSearch,
    title: 'Resume parsing',
    description:
      'PDF, DOCX, and plain-text resumes are parsed automatically, no copy-paste required.',
  },
  {
    icon: Users,
    title: 'Candidate experience',
    description:
      'A clean, fast portal where candidates upload once, apply many times, and track every step.',
  },
  {
    icon: Shield,
    title: 'Role-based access',
    description:
      'JWT auth with strict separation between candidate and recruiter capabilities, end-to-end.',
  },
  {
    icon: Zap,
    title: 'Smart filters',
    description:
      'Sort applicants by ATS score, recency, or keyword fit, and find your shortlist in seconds.',
  },
  {
    icon: Sparkles,
    title: 'Modern, lovable UI',
    description:
      'Tailwind, Framer Motion, dark mode and accessible interactions out of the box.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgb(var(--bg))]" />
        <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-500/30 via-purple-500/20 to-transparent blur-3xl" />

        <div className="container-page relative pb-24 pt-20 sm:pt-28 lg:pt-32">
          <FadeIn>
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'rgb(var(--border))' }}>
              <span className="grid h-1.5 w-1.5 place-items-center rounded-full bg-emerald-500" />
              Now scoring resumes against your job descriptions
            </div>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h1 className="mx-auto max-w-4xl text-center text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Hire smarter with{' '}
              <span className="bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
                applicant tracking
              </span>{' '}
              that actually understands resumes.
            </h1>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="muted mx-auto mt-6 max-w-2xl text-center text-lg">
              Ravi Demo ATS gives every applicant a fair score, and every recruiter a real
              shortlist, without the spreadsheet sprawl.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn-primary">
                Get started, it's free <ArrowRight size={16} />
              </Link>
              <Link href="/careers" className="btn-ghost">Browse roles</Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.25} className="mx-auto mt-16 max-w-5xl">
            <div className="card relative overflow-hidden p-2">
              <div className="rounded-xl border bg-gradient-to-br from-brand-500/5 to-purple-500/5 p-6 sm:p-10" style={{ borderColor: 'rgb(var(--border))' }}>
                <div className="grid gap-6 sm:grid-cols-3">
                  {[
                    { k: 'Time to shortlist', v: '6×', d: 'faster review with auto-scoring' },
                    { k: 'Resume formats', v: 'PDF · DOCX · TXT', d: 'parsed automatically on upload' },
                    { k: 'Recruiter signal', v: '0–100', d: 'transparent score per applicant' },
                  ].map((s) => (
                    <div key={s.k} className="text-center">
                      <div className="text-3xl font-semibold tracking-tight bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
                        {s.v}
                      </div>
                      <div className="mt-1 text-sm font-medium">{s.k}</div>
                      <div className="muted text-xs">{s.d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="container-page py-20">
        <FadeIn>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need to ship a hire
            </h2>
            <p className="muted mt-3">
              Designed end-to-end so you can spend more time on conversations and less time on tooling.
            </p>
          </div>
        </FadeIn>

        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <StaggerItem key={f.title}>
              <div className="card h-full p-6 transition hover:-translate-y-0.5 hover:shadow-soft">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
                  <f.icon size={18} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="muted mt-1.5 text-sm leading-relaxed">{f.description}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="container-page pb-24">
        <FadeIn>
          <div className="card relative overflow-hidden p-10 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-purple-500/10" />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to hire smarter?</h2>
              <p className="muted mx-auto mt-3 max-w-xl">
                Spin up an account in seconds. Your team will thank you.
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
