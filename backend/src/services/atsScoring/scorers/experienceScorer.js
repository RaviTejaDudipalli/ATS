const { detectYearsOfExperience, normalize } = require('../normalize');
const { canonicalize } = require('../synonyms');

/**
 * Experience scorer.
 *
 * Backwards compatible:
 *   - `score({ resumeText, requiredYears })` returns
 *     `{ fit, detected, required, applicable }` exactly as before.
 *
 * New optional inputs:
 *   - structured:    parseStructured(resumeText) — uses the experience
 *                     section if detected.
 *   - jobSkills:     canonicalized skills the job needs. Lets us measure
 *                     *relevant* years (skill is mentioned in a role
 *                     described with a year range) rather than total
 *                     career length.
 *
 * New (additive) output fields:
 *   - relevantYears:  total years adjacent to ≥1 required skill mention
 *   - perSkillYears:  { skill: years, … }
 *   - irrelevantYears: years detected outside any required-skill context
 *   - mismatchPenalty: factor in [0,1] applied to fit when a senior
 *                       resume's experience is in an unrelated domain
 */
function score({
  resumeText,
  requiredYears,
  structured,
  jobSkills,
} = {}) {
  const text = structured?.normalizedText || normalize(resumeText || '');
  const detected = structured?.years ?? detectYearsOfExperience(text);

  const ranges = extractDateRanges(text);
  const totalYears = ranges.reduce((s, r) => s + r.years, 0) || detected;

  // Per-skill / relevant-years analysis.
  const perSkillYears = {};
  let relevantYears = 0;
  if (jobSkills && jobSkills.length) {
    const canon = jobSkills.map(canonicalize);
    const expSection = structured?.sections?.experience?.normalizedText || text;
    const expRanges = extractDateRanges(expSection);

    for (const skill of canon) perSkillYears[skill] = 0;
    for (const r of expRanges) {
      const window = r.context;
      for (const skill of canon) {
        if (mentionsSkill(window, skill)) {
          perSkillYears[skill] += r.years;
        }
      }
    }
    // A skill might be mentioned across multiple overlapping roles; cap
    // each skill's tally at the candidate's total career years so we
    // don't claim "12 years of React" from a 5-year career.
    for (const k of Object.keys(perSkillYears)) {
      perSkillYears[k] = Math.min(perSkillYears[k], totalYears || perSkillYears[k]);
    }
    relevantYears = Math.max(...Object.values(perSkillYears), 0);
  }

  const irrelevantYears = Math.max(0, totalYears - relevantYears);

  // Mismatch penalty: if the candidate has plenty of total experience but
  // little of it is relevant, dampen the score. The shape is gentle — a
  // generalist still benefits from broad experience — but a "senior in
  // wrong domain" gets pulled toward parity with juniors who *are* in
  // domain.
  let mismatchPenalty = 1;
  if (totalYears >= 5 && jobSkills && jobSkills.length) {
    const ratio = relevantYears / Math.max(1, totalYears);
    // ratio=1 → no penalty; ratio=0 → 0.6 floor.
    mismatchPenalty = 0.6 + 0.4 * ratio;
  }

  // ---- back-compat scoring path ----
  let fit;
  let applicable = true;
  if (!requiredYears || requiredYears <= 0) {
    fit = text ? 0.6 : 0;
    applicable = false;
  } else {
    // Use relevantYears when available; otherwise fall back to detected
    // (legacy behavior preserved).
    const yearsForScore = jobSkills && jobSkills.length ? relevantYears || detected : detected;
    if (yearsForScore >= requiredYears) fit = 1;
    else if (yearsForScore > 0) fit = yearsForScore / requiredYears;
    else fit = 0;
  }

  fit = clamp01(fit * mismatchPenalty);

  return {
    fit,
    detected,
    required: requiredYears || 0,
    applicable,
    // Additive — recruiters' UI can show these without breaking on absence.
    totalYears,
    relevantYears,
    irrelevantYears,
    perSkillYears,
    mismatchPenalty,
    ranges,
  };
}

// ---------- helpers ----------

const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const YEAR_RE = '(19|20)\\d{2}';

// Match "Jan 2022 – Apr 2024", "2022-2024", "2018 - present", etc.
// We don't try to be pixel-perfect; missing a few ranges is fine, fabricating
// them is not — pattern is conservative.
const DATE_RANGE_RE = new RegExp(
  `(?:${MONTH_RE}\\s+)?(${YEAR_RE})\\s*(?:[–—\\-to]+)\\s*(?:${MONTH_RE}\\s+)?(?:(${YEAR_RE})|(present|current|now))`,
  'gi',
);

function extractDateRanges(text) {
  if (!text) return [];
  const out = [];
  const now = new Date().getFullYear();
  let m;
  // Reset lastIndex; in case the same regex is reused elsewhere.
  DATE_RANGE_RE.lastIndex = 0;
  while ((m = DATE_RANGE_RE.exec(text)) !== null) {
    const start = parseInt(m[1], 10);
    const end = m[3] ? parseInt(m[3], 10) : now;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 1980 || end < start || end > now + 1) continue;
    const years = Math.max(0.1, end - start);

    // Capture ±200 chars around the match for skill-context sniffing.
    const lo = Math.max(0, m.index - 200);
    const hi = Math.min(text.length, m.index + m[0].length + 200);
    out.push({ start, end, years, context: text.slice(lo, hi) });
  }
  return out;
}

function mentionsSkill(window, skill) {
  if (!window || !skill) return false;
  const needle = skill
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m)
    .replace(/_/g, '[\\s._-]+');
  return new RegExp(`(?:^|[^\\w])${needle}(?=$|[^\\w])`, 'i').test(window);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

module.exports = { score, extractDateRanges };
