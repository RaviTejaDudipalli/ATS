'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';

const DEFAULTS = {
  title: '',
  description: '',
  location: '',
  remote: false,
  type: 'FULL_TIME',
  status: 'OPEN',
  salaryMin: '',
  salaryMax: '',
  currency: 'USD',
  skills: '',
  minExperience: '',
};

export default function JobForm({ initial, onSubmit, submitLabel = 'Save job' }) {
  const [form, setForm] = useState({ ...DEFAULTS, ...(initial || {}) });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(field, parser = (v) => v) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setForm((f) => ({ ...f, [field]: parser(value) }));
    };
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        salaryMin: form.salaryMin === '' ? null : Number(form.salaryMin),
        salaryMax: form.salaryMax === '' ? null : Number(form.salaryMax),
        minExperience: form.minExperience === '' ? null : Number(form.minExperience),
      };
      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div>
        <label className="label" htmlFor="title">Job title</label>
        <input id="title" required className="input" value={form.title} onChange={update('title')} />
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea
          id="description"
          required
          rows={8}
          className="textarea"
          value={form.description}
          onChange={update('description')}
          placeholder="What will this person do? What does success look like? What's required?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" className="input" value={form.location || ''} onChange={update('location')} />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: 'rgb(var(--border))' }}>
            <input type="checkbox" checked={!!form.remote} onChange={update('remote')} /> Remote-friendly
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" className="select" value={form.type} onChange={update('type')}>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERNSHIP">Internship</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" className="select" value={form.status} onChange={update('status')}>
            <option value="OPEN">Open</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="minExperience">Min. experience (years)</label>
          <input id="minExperience" type="number" min="0" className="input" value={form.minExperience} onChange={update('minExperience')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="salaryMin">Salary min</label>
          <input id="salaryMin" type="number" min="0" className="input" value={form.salaryMin} onChange={update('salaryMin')} />
        </div>
        <div>
          <label className="label" htmlFor="salaryMax">Salary max</label>
          <input id="salaryMax" type="number" min="0" className="input" value={form.salaryMax} onChange={update('salaryMax')} />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <input id="currency" className="input" value={form.currency} onChange={update('currency')} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="skills">Skills (comma-separated)</label>
        <input id="skills" className="input" placeholder="react, typescript, postgresql" value={form.skills} onChange={update('skills')} />
        <p className="muted mt-1 text-xs">Used by the ATS scoring engine for skill matching.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

      <button disabled={loading} className="btn-primary">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {submitLabel}
      </button>
    </form>
  );
}
