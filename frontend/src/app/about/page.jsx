import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { Globe, Heart, Rocket, Users } from 'lucide-react';

const values = [
  {
    icon: Heart,
    title: 'Candidates first',
    description:
      'A hiring tool is only as good as the experience it gives the people on the other side of it.',
  },
  {
    icon: Globe,
    title: 'Built by Ravi',
    description:
      "Designed, developed, maintained, and optimized end-to-end by Ravi Teja D, with a game-changing, industry-leading ATS scoring algorithm that filters out the best possible candidates for every job opening.",
  },
  {
    icon: Rocket,
    title: 'Ship the work',
    description:
      'Small, well-tested releases beat big-bang launches. Make it real, watch it help someone.',
  },
  {
    icon: Users,
    title: 'Hire the team you need',
    description:
      'We treat hiring as a craft. We measure what we ship and we tell the truth about what is hard.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="container-page pt-20">
        <FadeIn>
          <div className="mx-auto max-w-3xl text-center">
            <span className="badge">About us</span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              We are building the most candidate-friendly ATS on the market.
            </h1>
            <p className="muted mx-auto mt-5 max-w-2xl text-lg">
              Ravi Demo ATS started as a personal project after one too many "thank you for applying" form
              letters. Today it powers hiring for fast-growing teams that want to do better.
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

      <section className="container-page pb-24">
        <FadeIn>
          <div className="card grid gap-8 p-10 sm:grid-cols-3">
            {[
              { k: '2,400+', d: 'roles posted on Ravi Demo ATS' },
              { k: '60+', d: 'companies hiring with us' },
              { k: '92%', d: 'of candidates feel respected by the process' },
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
    </>
  );
}
