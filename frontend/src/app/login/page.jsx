'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { FadeIn } from '@/components/ui/motion';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect');
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
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
        <div className="card w-full max-w-md p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="muted mt-1 text-sm">Sign in to continue your hiring journey.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
            )}

            <button disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Log in
            </button>
          </form>

          <p className="muted mt-6 text-center text-sm">
            Don't have an account? <Link href="/signup" className="font-medium text-brand-600">Sign up</Link>
          </p>

          <div className="mt-6 rounded-xl border p-3 text-xs muted" style={{ borderColor: 'rgb(var(--border))' }}>
            <div className="font-semibold">Demo accounts</div>
            <div>recruiter@demo.com / Recruiter#1</div>
            <div>candidate@demo.com / Candidate#1</div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
