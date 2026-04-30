/**
 * Page-based pagination with sane caps. Cursor pagination is preferable for
 * truly large datasets, but page numbers are easier to wire to the existing
 * UI and good enough up to mid-six-figure rowcounts.
 */
const { z } = require('zod');

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});

function parsePage(query) {
  // Returns { page, perPage, skip, take } — never throws; falls back to defaults.
  const parsed = pageQuerySchema.safeParse(query);
  const { page, perPage } = parsed.success
    ? parsed.data
    : { page: 1, perPage: DEFAULT_PER_PAGE };
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

function pageMeta({ page, perPage, total }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = { parsePage, pageMeta, DEFAULT_PER_PAGE, MAX_PER_PAGE };
