'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function AuthGate({ role, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (role && user.role !== role) {
      router.replace(user.role === 'RECRUITER' ? '/recruiter/dashboard' : '/candidate/dashboard');
    }
  }, [loading, user, role, router]);

  if (loading || !user || (role && user.role !== role)) {
    return (
      <div className="container-page grid place-items-center py-32">
        <Loader2 className="animate-spin muted" />
      </div>
    );
  }

  return children;
}
