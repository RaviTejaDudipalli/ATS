'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Briefcase, Clock, Globe, Loader2 } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatSalary, jobTypeLabel } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  const [coverLetter, setCoverLetter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    api.get(`/api/jobs/${id}`)
      .then((d) => { if (alive) setJob(d.job); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  async function onApply(e) {
    e.preventDefault();
    if (!user) {
      router.push(`/login?redirect=/jobs/${id}`);
      return;
    }
    if (user.role !== 'CANDIDATE') {
      setApplyResult({ kind: 'error', msg: 'Only candidate accounts can apply.' });
      return;
    }
    setSubmitting(true);
    setApplyResult(null);
    try {
      await api.post('/api/applications', { jobId: id, coverLetter });
      const msg = "We'll score your resume against the role in the background. Check your dashboard.";
      setApplyResult({ kind: 'ok', msg: 'Application submitted. ' + msg });
      toast.success('Application submitted', msg);
      setCoverLetter('');
    } catch (err) {
      setApplyResult({ kind: 'error', msg: err.message });
      toast.error('Could not submit application', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const skills = (job?.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
  const salary = job ? formatSalary(job.salaryMin, job.salaryMax, job.currency) : null;

  return (
    <section className="container-page py-12">
      <Link href="/careers" className="muted inline-flex items-center gap-1 text-sm hover:text-current">
        <ArrowLeft size={14} /> Back to careers
      </Link>

      {error && <div className="card mt-6 p-6 text-rose-500">{error}</div>}

      {!job && !error && (
        <div className="mt-8 grid gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-4 h-32 w-full" />
        </div>
      )}

      {job && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-6 grid gap-8 lg:grid-cols-3"
        >
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge">{jobTypeLabel(job.type)}</span>
              {job.remote && <span className="badge badge-success">Remote</span>}
              <span className="badge badge-muted">{job.recruiter?.company}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{job.title}</h1>

            <div className="muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {job.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {job.location}</span>}
              {salary && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} /> {salary}</span>}
              {job.minExperience != null && <span className="inline-flex items-center gap-1.5"><Globe size={14} /> {job.minExperience}+ yrs experience</span>}
              <span className="inline-flex items-center gap-1.5"><Clock size={14} /> Posted {formatDate(job.createdAt)}</span>
            </div>

            <div className="card mt-8 p-6">
              <h3 className="text-lg font-semibold">Role</h3>
              <p className="muted mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed">
                {job.description}
              </p>
            </div>

            {skills.length > 0 && (
              <div className="card mt-6 p-6">
                <h3 className="text-lg font-semibold">Skills we look for</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((s) => <span key={s} className="badge">{s}</span>)}
                </div>
              </div>
            )}
          </div>

          <aside className="lg:col-span-1">
            <div className="card sticky top-20 p-6">
              <h3 className="text-lg font-semibold">Apply for this role</h3>
              {!authLoading && (!user || user.role === 'CANDIDATE') ? (
                <form onSubmit={onApply} className="mt-4 space-y-3">
                  <div>
                    <label className="label" htmlFor="cover">Cover letter (optional)</label>
                    <textarea
                      id="cover"
                      rows={5}
                      className="textarea"
                      placeholder="A short note to the team…"
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                    />
                  </div>
                  {applyResult && (
                    <div className={`rounded-xl border p-3 text-sm ${applyResult.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
                      {applyResult.msg}
                    </div>
                  )}
                  <button disabled={submitting} className="btn-primary w-full">
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {user ? 'Submit application' : 'Log in to apply'}
                  </button>
                  {!user && (
                    <p className="muted text-center text-xs">
                      New here? <Link href={`/signup?redirect=/jobs/${id}`} className="text-brand-600">Create an account</Link>.
                    </p>
                  )}
                </form>
              ) : (
                <p className="muted mt-3 text-sm">
                  You're signed in as a recruiter. Switch to a candidate account to apply.
                </p>
              )}
            </div>
          </aside>
        </motion.div>
      )}
    </section>
  );
}
