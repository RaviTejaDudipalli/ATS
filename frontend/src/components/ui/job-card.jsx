'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Briefcase, Clock, ArrowRight } from 'lucide-react';
import { formatDate, formatSalary, jobTypeLabel } from '@/lib/format';

export default function JobCard({ job }) {
  const skills = (job.skills || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency);
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="card group flex h-full flex-col p-6"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="badge">{jobTypeLabel(job.type)}</span>
        {job.remote && <span className="badge badge-success">Remote</span>}
      </div>
      <h3 className="text-lg font-semibold leading-tight">{job.title}</h3>
      <div className="muted mt-1 text-sm">
        {job.recruiter?.company || 'Northwind Labs'}
      </div>

      <div className="muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {job.location && <span className="inline-flex items-center gap-1"><MapPin size={14} /> {job.location}</span>}
        {salary && <span className="inline-flex items-center gap-1"><Briefcase size={14} /> {salary}</span>}
        <span className="inline-flex items-center gap-1"><Clock size={14} /> {formatDate(job.createdAt)}</span>
      </div>

      {skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className="badge badge-muted">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between pt-2">
        <span className="muted text-xs">
          {job._count?.applications ?? 0} applicants
        </span>
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition group-hover:gap-2"
        >
          View role <ArrowRight size={14} />
        </Link>
      </div>
    </motion.div>
  );
}
