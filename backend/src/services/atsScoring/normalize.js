/**
 * Text normalization. Shared by the resume parser AND the scoring engine
 * so they agree on how a token looks. If you change one, change both.
 *
 * This module is the single source of truth for:
 *   - Cleaning raw text (`normalize`, `cleanLines`)
 *   - Tokenization (`tokenize`)
 *   - Phrase / token-bounded substring lookup (`containsPhrase`)
 *   - Years-of-experience extraction
 *   - Section-aware parsing (`splitSections`, `parseStructured`)
 *
 * The original primitives (`normalize`, `tokenize`, `topKeywords`,
 * `containsPhrase`, `detectYearsOfExperience`, `parseSkillList`,
 * `STOPWORDS`) are unchanged in signature; new helpers are additive.
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

function normalize(input) {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    .replace(/­/g, '')
    .replace(/-\s*\n\s*/g, '')
    .replace(/[‐-―]/g, '-')
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

function containsPhrase(haystack, needle) {
  if (!needle) return false;
  const norm = normalize(haystack);
  const pattern = needle
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m))
    .join('\\s+');
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

// ---------- section-aware parsing ----------

/**
 * Section heading aliases. Map an alias → canonical section name so we can
 * group lines by what part of the resume they belong to. Canonical names
 * are intentionally narrow; anything outside the allow-list ends up under
 * `other` (which is still scored, just not section-weighted).
 */
const SECTION_ALIASES = {
  summary: ['summary', 'profile', 'objective', 'about me', 'about'],
  skills: [
    'skills', 'technical skills', 'core skills', 'core competencies',
    'competencies', 'technologies', 'tech stack', 'tools', 'expertise',
  ],
  experience: [
    'experience', 'work experience', 'professional experience',
    'employment', 'employment history', 'work history', 'career history',
    'professional background',
  ],
  projects: ['projects', 'personal projects', 'side projects', 'open source'],
  education: ['education', 'academics', 'academic background', 'qualifications'],
  certifications: ['certifications', 'certificates', 'licenses'],
  awards: ['awards', 'honors', 'achievements', 'accomplishments'],
};

const ALIAS_LOOKUP = new Map();
for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
  for (const a of aliases) ALIAS_LOOKUP.set(a, canonical);
}

const SECTION_HEADING_RE = (() => {
  const all = Object.values(SECTION_ALIASES).flat();
  // Sort longest first so "work experience" beats "experience".
  all.sort((a, b) => b.length - a.length);
  const escaped = all.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m));
  return new RegExp(`^\\s*(?:[#*•\\->]+\\s*)?(${escaped.join('|')})\\s*[:\\-—]?\\s*$`, 'i');
})();

/**
 * Group lines under canonical section names. Anything before the first
 * recognized heading lands in `header` (typically name / contact info /
 * summary). Unknown headings collapse into `other`.
 *
 * Note: this returns the *original* (case-preserved, but whitespace-
 * collapsed) lines so downstream code can still apply its own normalization.
 */
function splitSections(rawText) {
  const sections = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    awards: [],
    other: [],
  };
  if (!rawText) return sections;

  const lines = String(rawText)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let current = 'header';
  for (const line of lines) {
    const m = SECTION_HEADING_RE.exec(line);
    if (m) {
      const canonical = ALIAS_LOOKUP.get(m[1].toLowerCase());
      current = canonical || 'other';
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

/**
 * Pre-tokenized, structured view of a resume. Computed once per scoring
 * pass and shared across scorers — the previous design ran tokenization
 * and section detection inside every scorer.
 *
 * Shape:
 *   {
 *     normalizedText: string,        // single normalized blob (back-compat)
 *     tokens: string[],              // tokens for the whole document
 *     tokenSet: Set<string>,         // O(1) lookup
 *     tf: Map<string, number>,       // term frequencies
 *     sections: {
 *       <name>: { text, tokens, tokenSet, tf }
 *     },
 *     years: number,
 *   }
 */
function parseStructured(rawText) {
  const sections = splitSections(rawText);
  const normalizedText = normalize(rawText || '');

  const docTokens = tokenize(normalizedText);
  const docTf = countTokens(docTokens);

  const sectionViews = {};
  for (const [name, lines] of Object.entries(sections)) {
    const text = lines.join('\n');
    const norm = normalize(text);
    const toks = tokenize(norm);
    sectionViews[name] = {
      text,
      normalizedText: norm,
      tokens: toks,
      tokenSet: new Set(toks),
      tf: countTokens(toks),
    };
  }

  return {
    rawText: rawText || '',
    normalizedText,
    tokens: docTokens,
    tokenSet: new Set(docTokens),
    tf: docTf,
    sections: sectionViews,
    years: detectYearsOfExperience(normalizedText),
  };
}

function countTokens(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

module.exports = {
  // existing exports — DO NOT change shape
  normalize,
  tokenize,
  topKeywords,
  containsPhrase,
  detectYearsOfExperience,
  parseSkillList,
  STOPWORDS,
  // new: section-aware parsing + structured view
  splitSections,
  parseStructured,
  countTokens,
  SECTION_ALIASES,
};
