const { topKeywords, tokenize, countTokens } = require('../normalize');

/**
 * Keyword overlap scorer — TF-IDF flavored, with anti-stuffing.
 *
 * What changed vs. v1:
 *   - We weight matches by IDF derived from the JD itself (rare JD tokens
 *     count more than common ones). No external corpus required: the JD
 *     is short enough that smoothed within-document IDF is already useful.
 *   - "Keyword stuffing" defense: token frequency in the resume is capped
 *     before it enters the score. A resume that lists "react" 50 times
 *     doesn't beat one that uses it 4 times in context.
 *   - We compute over a bounded keyword set (top-N JD terms, default 25)
 *     so the result stays comparable across jobs.
 *
 * Backward compatible:
 *   - `score({ jobText, resumeText })` returns `{ fit, hits, total }` as
 *     before. New fields (`weightedHits`, `keywords`, `stuffing`) are
 *     additive.
 *   - Optional `structured` skips re-tokenizing the resume.
 *   - Optional `jobKeywords` precomputed list lets the orchestrator
 *     compute JD keywords once across many resumes.
 */

function score({
  jobText,
  resumeText,
  structured,
  jobKeywords,
  k = 25,
  stuffingCap = 5,            // a single resume token contributes ≤ this to TF
}) {
  const kw = jobKeywords && jobKeywords.length ? jobKeywords : topKeywords(jobText, k);
  if (kw.length === 0) {
    return { fit: 0, hits: 0, total: 0, weightedHits: 0, keywords: [], stuffing: { capped: 0 } };
  }

  const resumeTokens = structured?.tokens || tokenize(resumeText || '');
  const resumeTf = structured?.tf || countTokens(resumeTokens);

  // Within-document IDF over the keyword set. Smoothed so a one-off term
  // doesn't get an absurdly high weight.
  // df = 1 if keyword present in the resume; we treat presence as the
  // discrete document frequency for the keyword's IDF over a corpus of
  // size 2 (resume vs. JD). That's degenerate, so instead we weight by
  // *rarity within the JD itself*: the inverse of the JD frequency.
  const jdTf = countTokens(tokenize(jobText || ''));

  let totalWeight = 0;
  let earned = 0;
  let hits = 0;
  let cappedTokens = 0;

  const detail = [];
  for (const w of kw) {
    const jdFreq = jdTf.get(w) || 1;
    const idf = Math.log(1 + 10 / jdFreq);   // smoothed; "10" is just scale
    const cap = stuffingCap;
    const rawTf = resumeTf.get(w) || 0;
    const cappedTf = Math.min(rawTf, cap);
    if (rawTf > cap) cappedTokens += rawTf - cap;

    const present = cappedTf > 0;
    const tfWeight = present ? Math.log1p(cappedTf) / Math.log1p(cap) : 0;
    const weight = idf;
    totalWeight += weight;
    earned += tfWeight * weight;
    if (present) hits += 1;
    detail.push({ keyword: w, idf, jdFreq, resumeFreq: rawTf, weight: tfWeight * weight });
  }

  const fit = totalWeight ? earned / totalWeight : 0;

  return {
    fit: clamp01(fit),
    hits,
    total: kw.length,
    weightedHits: round3(earned),
    keywords: detail,
    stuffing: { capped: cappedTokens, cap: stuffingCap },
  };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round3(x) { return Math.round(x * 1000) / 1000; }

module.exports = { score };
