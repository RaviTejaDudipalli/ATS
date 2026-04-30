export function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatSalary(min, max, currency = 'USD') {
  if (!min && !max) return null;
  const fmt = (n) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(n);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max);
}

export function jobTypeLabel(t) {
  return ({
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACT: 'Contract',
    INTERNSHIP: 'Internship',
  })[t] || t;
}

export function statusLabel(s) {
  return ({
    APPLIED: 'Applied',
    REVIEWING: 'Reviewing',
    SHORTLISTED: 'Shortlisted',
    INTERVIEW: 'Interview',
    REJECTED: 'Rejected',
    HIRED: 'Hired',
    OPEN: 'Open',
    CLOSED: 'Closed',
    DRAFT: 'Draft',
  })[s] || s;
}

export function statusBadgeClass(s) {
  switch (s) {
    case 'HIRED':
    case 'OPEN':
      return 'badge-success';
    case 'SHORTLISTED':
    case 'INTERVIEW':
    case 'REVIEWING':
      return '';
    case 'REJECTED':
    case 'CLOSED':
      return 'badge-danger';
    case 'DRAFT':
      return 'badge-warning';
    default:
      return 'badge-muted';
  }
}
