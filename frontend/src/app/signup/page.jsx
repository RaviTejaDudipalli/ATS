'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { FadeIn } from '@/components/ui/motion';

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { signup } = useAuth();

  const [role, setRole] = useState('CANDIDATE');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    company: '',
    title: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const r = params.get('role');
    if (r === 'recruiter') setRole('RECRUITER');
    if (r === 'candidate') setRole('CANDIDATE');
  }, [params]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await signup({ ...form, role });
      const redirect = params.get('redirect');
      const target = redirect ||
        (user.role === 'RECRUITER' ? '/recruiter/dashboard' : '/candidate/dashboard');
      router.push(target);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="container-page grid place-items-center py-20">
      <FadeIn>
        <div className="card w-full max-w-lg p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="muted mt-1 text-sm">Choose how you'll use Ravi Demo ATS.</p>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border p-1" style={{ borderColor: 'rgb(var(--border))' }}>
            {['CANDIDATE', 'RECRUITER'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${role === r ? 'bg-brand-500 text-white shadow-soft' : 'muted hover:text-current'}`}
              >
                {r === 'CANDIDATE' ? 'I am a candidate' : 'I am a recruiter'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fullName">Full name</label>
                <input id="fullName" required className="input" value={form.fullName} onChange={update('fullName')} />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" required className="input" value={form.email} onChange={update('email')} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} className="input" value={form.password} onChange={update('password')} />
              <p className="muted mt-1 text-xs">At least 8 characters.</p>
            </div>

            {role === 'CANDIDATE' ? (
              <div>
                <label className="label" htmlFor="phone">Phone (optional)</label>
                <input id="phone" className="input" value={form.phone} onChange={update('phone')} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="company">Company</label>
                  <input id="company" required className="input" value={form.company} onChange={update('company')} />
                </div>
                <div>
                  <label className="label" htmlFor="title">Title (optional)</label>
                  <input id="title" className="input" value={form.title} onChange={update('title')} />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
            )}

            <button disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Create account
            </button>
          </form>

          <p className="muted mt-6 text-center text-sm">
            Already have an account? <Link href="/login" className="font-medium text-brand-600">Log in</Link>
          </p>
        </div>
      </FadeIn>
    </section>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
