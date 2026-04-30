const { topKeywords, tokenize } = require('../normalize');

/**
 * Keyword overlap scorer.
 *
 * We pull the top-N tokens from the JD (after stopword removal) and check
 * how many appear in the resume's token set. This is intentionally crude —
 * the synonym-aware skill scorer does the heavy lifting; keywords just
 * reward general topical alignment.
 */
function score({ jobText, resumeText, k = 25 }) {
  const kw = topKeywords(jobText, k);
  if (kw.length === 0) return { fit: 0, hits: 0, total: 0 };

  const resumeSet = new Set(tokenize(resumeText));
  let hits = 0;
  for (const w of kw) if (resumeSet.has(w)) hits += 1;

  return { fit: hits / kw.length, hits, total: kw.length };
}

module.exports = { score };
