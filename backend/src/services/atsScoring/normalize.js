/**
 * Text normalization. Shared by the resume parser AND the scoring engine
 * so they agree on how a token looks. If you change one, change both.
 */

const STOPWORDS = new Set([
  'the','and','for','with','our','you','your','are','will','have','has','from','this','that','into',
  'work','role','team','about','using','use','used','strong','experience','years','year','plus','well',
  'across','etc','able','any','all','who','what','when','where','why','how','its','their','they','them',
  'we','us','as','at','an','of','to','in','on','by','or','be','is','it','if','so','do','does','done',
  'looking','candidate','candidates','job','jobs','must','should','design','designing','build','building',
  'engineer','engineering','developer','developers','company','position','responsibilities','requirements',
  'good','great','best','also','more','than','over','up','down','like','want','wants','wanted','need',
  'needs','required','preferred','nice','have','having','some','one','two','three','first','second',
]);

/**
 * Normalize free text:
 *   - lower-case
 *   - de-hyphenate end-of-line breaks ("data-\nbase" → "database")
 *   - collapse whitespace
 *   - keep alphanum + a few language tokens (+ # . / -)
 */
function normalize(input) {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    .replace(/­/g, '')                  // soft hyphens
    .replace(/-\s*\n\s*/g, '')               // hyphenated line breaks
    .replace(/[‐-―]/g, '-')        // unicode dashes
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text, { keepShort = false } = {}) {
  return normalize(text)
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && (keepShort || t.length > 2) && !STOPWORDS.has(t));
}

/**
 * True iff `needle` (a phrase) appears as a token sequence in `haystack`.
 * Token-aware so "react" doesn't match "reaction".
 */
function containsPhrase(haystack, needle) {
  if (!needle) return false;
  const norm = normalize(haystack);
  // Build a regex: word-boundary BEFORE the first char and AFTER the last,
  // tolerate flexible whitespace between tokens.
  const pattern = needle
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m))
    .join('\\s+');
  // \b doesn't play well with `+`, `#`, `/` (think "c++", "c#", "ci/cd"),
  // so we use lookarounds for "not adjacent to a word character".
  const re = new RegExp(`(?:^|[^\\w])${pattern}(?=$|[^\\w])`);
  return re.test(norm);
}

function topKeywords(text, k = 25) {
  const counts = new Map();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w]) => w);
}

function detectYearsOfExperience(text) {
  if (!text) return 0;
  const norm = normalize(text);
  let best = 0;
  const patterns = [
    /(\d{1,2})\s*\+?\s*(?:years|yrs)\s*(?:of\s*)?(?:experience|exp)?/g,
    /(?:over|more than)\s*(\d{1,2})\s*(?:years|yrs)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(norm)) !== null) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > best && n < 50) best = n;
    }
  }
  return best;
}

function parseSkillList(skills) {
  return (skills || '')
    .split(/[,\n;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  normalize,
  tokenize,
  topKeywords,
  containsPhrase,
  detectYearsOfExperience,
  parseSkillList,
  STOPWORDS,
};
