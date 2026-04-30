'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, Upload, FileText, ExternalLink } from 'lucide-react';

import AuthGate from '@/components/auth-gate';
import { FadeIn } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';
import { api, downloadProtected } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

function ProfileInner() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    api.get('/api/candidates/me')
      .then((d) => { if (alive) setProfile(d.candidate); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  function update(field) {
    return (e) => setProfile((p) => ({ ...p, [field]: e.target.value }));
  }

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await api.put('/api/candidates/me', {
        fullName: profile.fullName,
        phone: profile.phone || '',
        headline: profile.headline || '',
        linkedinUrl: profile.linkedinUrl || '',
        githubUrl: profile.githubUrl || '',
        portfolioUrl: profile.portfolioUrl || '',
        location: profile.location || '',
      });
      setProfile((p) => ({ ...p, ...data.candidate }));
      setSavedAt(new Date());
      toast.success('Profile saved');
    } catch (err) {
      setError(err.message);
      toast.error('Could not save profile', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Surface size limits before round-tripping to the server.
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'Resume must be 10 MB or less.';
      setUploadError(msg);
      toast.error('File too large', msg);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const data = await api.upload('/api/uploads/resume', fd);
      setProfile((p) => ({
        ...p,
        resume: {
          ...(p?.resume || {}),
          id: data.resume.id,
          fileName: data.resume.fileName,
          uploadedAt: data.resume.uploadedAt,
          sizeBytes: data.resume.sizeBytes,
        },
      }));
      toast.success('Resume uploaded', "We'll re-score your applications automatically.");
    } catch (err) {
      setUploadError(err.message);
      toast.error('Upload failed', err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!profile && !error) {
    return (
      <section className="container-page py-12">
        <p className="muted">Loading profile…</p>
      </section>
    );
  }

  return (
    <section className="container-page py-10">
      <FadeIn>
        <h1 className="text-3xl font-semibold tracking-tight">Profile & resume</h1>
        <p className="muted mt-1">Keep this fresh — recruiters and our scoring engine both rely on it.</p>
      </FadeIn>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <form onSubmit={onSave} className="card lg:col-span-2 space-y-4 p-6">
          <h3 className="text-lg font-semibold">Personal info</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fullName">Full name</label>
              <input id="fullName" required className="input" value={profile?.fullName || ''} onChange={update('fullName')} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" className="input" value={profile?.phone || ''} onChange={update('phone')} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="headline">Headline</label>
            <input id="headline" className="input" placeholder="Senior frontend engineer · React + TypeScript" value={profile?.headline || ''} onChange={update('headline')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="linkedinUrl">LinkedIn</label>
              <input id="linkedinUrl" className="input" placeholder="https://…" value={profile?.linkedinUrl || ''} onChange={update('linkedinUrl')} />
            </div>
            <div>
              <label className="label" htmlFor="githubUrl">GitHub</label>
              <input id="githubUrl" className="input" placeholder="https://…" value={profile?.githubUrl || ''} onChange={update('githubUrl')} />
            </div>
            <div>
              <label className="label" htmlFor="portfolioUrl">Portfolio</label>
              <input id="portfolioUrl" className="input" placeholder="https://…" value={profile?.portfolioUrl || ''} onChange={update('portfolioUrl')} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="location">Location</label>
            <input id="location" className="input" value={profile?.location || ''} onChange={update('location')} />
          </div>

          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

          <div className="flex items-center gap-3">
            <button disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save profile
            </button>
            {savedAt && <span className="muted text-sm">Saved {formatDateTime(savedAt)}</span>}
          </div>
        </form>

        <div className="card space-y-4 p-6">
          <h3 className="text-lg font-semibold">Resume</h3>

          {profile?.resume ? (
            <div className="rounded-xl border p-4" style={{ borderColor: 'rgb(var(--border))' }}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
                  <FileText size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{profile.resume.fileName}</div>
                  <div className="muted text-xs">
                    {Math.max(1, Math.round(profile.resume.sizeBytes / 1024))} KB · uploaded {formatDateTime(profile.resume.uploadedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadProtected(`/api/files/resumes/${profile.resume.id}`).catch((err) =>
                      toast.error('Could not open resume', err.message),
                    )
                  }
                  className="btn-ghost h-9 w-9 !px-0"
                  aria-label="Open resume in a new tab"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ) : (
            <p className="muted text-sm">No resume on file yet — upload one to start applying.</p>
          )}

          <label className="btn-primary w-full cursor-pointer">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {profile?.resume ? 'Replace resume' : 'Upload resume'}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={onUpload}
            />
          </label>
          {uploadError && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{uploadError}</div>}
          <p className="muted text-xs">PDF, DOCX, DOC or TXT. Up to 10 MB.</p>

          <div className="border-t pt-4" style={{ borderColor: 'rgb(var(--border))' }}>
            <Link href="/candidate/dashboard" className="muted text-sm hover:text-current">← Back to dashboard</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Page() {
  return <AuthGate role="CANDIDATE"><ProfileInner /></AuthGate>;
}
