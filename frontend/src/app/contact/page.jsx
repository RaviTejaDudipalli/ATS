'use client';

import { useState } from 'react';
import { Mail, MapPin, Phone, Send } from 'lucide-react';
import { FadeIn } from '@/components/ui/motion';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState(null);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      setStatus({ kind: 'error', msg: 'Please fill out all fields.' });
      return;
    }
    setStatus({ kind: 'ok', msg: "Thanks, I'll be in touch within one business day." });
    setForm({ name: '', email: '', message: '' });
  }

  return (
    <section className="container-page py-20">
      <FadeIn>
        <div className="mx-auto max-w-3xl text-center">
          <span className="badge">Contact</span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Talk to a human
          </h1>
          <p className="muted mx-auto mt-4 max-w-xl">
            Have a question, an integration request, or feedback on the product? Drop me a line.
          </p>
        </div>
      </FadeIn>

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-5">
        <FadeIn className="lg:col-span-2" delay={0.05}>
          <div className="card h-full p-6">
            <h3 className="text-lg font-semibold">Reach out to me</h3>
            <p className="muted mt-1 text-sm">Ravi Teja D</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white"><Mail size={16} /></span>
                <a href="mailto:ravitejachoudary6@gmail.com" className="hover:underline">ravitejachoudary6@gmail.com</a>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white"><Phone size={16} /></span>
                <a href="tel:+917993498259" className="hover:underline">+91 79934 98259</a>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white"><MapPin size={16} /></span>
                Remote · India
              </li>
            </ul>
          </div>
        </FadeIn>

        <FadeIn className="lg:col-span-3" delay={0.1}>
          <form onSubmit={onSubmit} className="card space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input id="name" className="input" value={form.name} onChange={update('name')} placeholder="Casey Candidate" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input" value={form.email} onChange={update('email')} placeholder="you@company.com" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="message">How can we help?</label>
              <textarea id="message" rows={5} className="textarea" value={form.message} onChange={update('message')} placeholder="Tell us a little about your team and what you're trying to do…" />
            </div>

            {status && (
              <div className={`rounded-xl border p-3 text-sm ${status.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
                {status.msg}
              </div>
            )}

            <button type="submit" className="btn-primary"><Send size={16} /> Send message</button>
          </form>
        </FadeIn>
      </div>
    </section>
  );
}
