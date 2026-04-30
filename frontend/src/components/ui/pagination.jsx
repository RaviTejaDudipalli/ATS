'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Simple, accessible page-number control. We don't show every page —
 * just prev / "Page X of Y" / next, which scales fine to thousands of pages
 * without DOM bloat and is screen-reader friendly.
 */
export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, hasPrev, hasNext, total } = pagination;
  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between gap-3"
    >
      <p className="muted text-sm" aria-live="polite">
        Page <span className="font-medium">{page}</span> of {totalPages}
        {typeof total === 'number' && <span className="muted"> · {total} total</span>}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => hasPrev && onChange(page - 1)}
          disabled={!hasPrev}
          className="btn-ghost"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <button
          type="button"
          onClick={() => hasNext && onChange(page + 1)}
          disabled={!hasNext}
          className="btn-ghost"
          aria-label="Next page"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
