const { canonicalize, fuzzyCanonicalize } = require('../synonyms');
const {
  containsPhrase,
  parseSkillList,
  tokenize,
} = require('../normalize');
const { ngramSimilarity } = require('../embeddings');

/**
 * Skill match scorer.
 *
 * Backward compatible inputs (existing call shape):
 *   { jobSkills, resumeText, resumeSkills }
 *
 * New optional inputs:
 *   - structured:   parseStructured(resumeText) — when provided, the scorer
 *                    uses section-aware token frequencies (skills section
 *                    weighted higher than narrative mentions) and avoids
 *                    re-tokenizing.
 *   - weightedJobSkills:  [{ name, required: bool, weight: number }, …]
 *                    overrides `jobSkills` if present. Lets recruiters
 *                    distinguish must-have vs. nice-to-have.
 *   - partial:      enable n-gram-similarity fallback for unrecognized
 *                    surface forms. Default `true`; on by default because
 *                    typos and missing synonyms are common.
 *
 * Output (existing fields kept; new fields additive):
 *   {
 *     fit, applicable,
 *     matched: [canonical, …]        // hits at any quality
 *     missing: [canonical, …]
 *     details: [
 *       {
 *         skill, required, weight,
 *         matched, matchKind: 'exact'|'phrase'|'partial'|'none',
 *         frequency, proficiency, recency,
 *         score                       // contribution in [0,1]
 *       }
 *     ],
 *     proficiency: { <skill>: 0..1 }, // back-compat shortcut
 *   }
 */
function score({
  jobSkills,
  resumeText,
  resumeSkills,
  structured,
  weightedJobSkills,
  partial = true,
} = {}) {
  const required = normalizeSkillList(weightedJobSkills, jobSkills);
  if (required.length === 0) {
    return {
      fit: 0,
      matched: [],
      missing: [],
      applicable: false,
      details: [],
      proficiency: {},
    };
  }

  const text = structured?.normalizedText || resumeText || '';
  const tokens = structured?.tokens || tokenize(text);
  const tokenCount = Math.max(1, tokens.length);

  // The "skills" section, when detected, is the strongest signal. Mentions
  // there carry extra weight in the proficiency calculation.
  const skillsSection = structured?.sections?.skills;
  const experienceSection = structured?.sections?.experience;
  const detectedSet = new Set((resumeSkills || []).map(canonicalize));

  const matched = [];
  const missing = [];
  const details = [];
  const proficiency = {};

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const item of required) {
    totalWeight += item.weight;
    const probe = matchSkill({
      skill: item.skill,
      text,
      tokens,
      detectedSet,
      skillsSection,
      experienceSection,
      partial,
    });

    if (probe.matched) matched.push(item.skill);
    else missing.push(item.skill);

    // Required skills are scored harder: a partial match earns 50% credit
    // instead of full. Optional skills behave as before.
    let quality = matchQuality(probe.matchKind);
    if (item.required && probe.matchKind === 'partial') quality *= 0.5;

    const prof = estimateProficiency({
      frequency: probe.frequency,
      tokenCount,
      inSkillsSection: probe.inSkillsSection,
      inExperienceSection: probe.inExperienceSection,
      recency: probe.recency,
    });
    proficiency[item.skill] = prof;

    const skillScore = quality * (0.5 + 0.5 * prof);  // floor at 0.5 of quality
    earnedWeight += skillScore * item.weight;

    details.push({
      skill: item.skill,
      required: item.required,
      weight: item.weight,
      matched: probe.matched,
      matchKind: probe.matchKind,
      frequency: probe.frequency,
      proficiency: prof,
      recency: probe.recency,
      score: skillScore,
    });
  }

  // Required skills act as gates: a missing required skill caps the fit.
  const requiredItems = required.filter((r) => r.required);
  const requiredMissing = requiredItems.filter(
    (r) => !details.find((d) => d.skill === r.skill && d.matched),
  );
  const requiredCoverage = requiredItems.length
    ? 1 - requiredMissing.length / requiredItems.length
    : 1;

  const rawFit = totalWeight ? earnedWeight / totalWeight : 0;
  const fit = clamp01(rawFit * (0.5 + 0.5 * requiredCoverage));

  return {
    fit,
    matched,
    missing,
    applicable: true,
    details,
    proficiency,
    requiredMissing: requiredMissing.map((r) => r.skill),
  };
}

// ---------- helpers ----------

/**
 * Accept any of:
 *   - parseSkillList output (string[])      → all weight 1, optional
 *   - { name|skill, required?, weight? }[]   → respected as-is
 *
 * The DSL `react*` (suffix asterisk) marks "required" so recruiters can
 * encode it inline in the existing comma-separated `job.skills` field
 * without a schema change:
 *
 *     "react*, typescript*, redux, tailwind"
 *
 * `react!` and `*react` are also accepted.
 */
function normalizeSkillList(weighted, fallbackList) {
  const list = weighted && weighted.length
    ? weighted.map((w) => normalizeWeightedItem(w))
    : (fallbackList || []).map((s) => parseInlineMarkers(s));

  // Canonicalize and dedupe by canonical key. Preserve `required` if any
  // of the source rows asserts it.
  const merged = new Map();
  for (const item of list) {
    if (!item || !item.skill) continue;
    const canon = canonicalize(item.skill);
    const prev = merged.get(canon);
    if (!prev) {
      merged.set(canon, { skill: canon, required: !!item.required, weight: item.weight ?? 1 });
    } else {
      prev.required = prev.required || !!item.required;
      prev.weight = Math.max(prev.weight, item.weight ?? 1);
    }
  }
  return [...merged.values()];
}

function normalizeWeightedItem(w) {
  if (typeof w === 'string') return parseInlineMarkers(w);
  const name = w.name || w.skill || '';
  return {
    skill: name.replace(/[*!]/g, '').trim(),
    required: !!w.required,
    weight: typeof w.weight === 'number' ? w.weight : (w.required ? 2 : 1),
  };
}

function parseInlineMarkers(raw) {
  const s = String(raw || '').trim();
  const required = /[*!]/.test(s);
  return {
    skill: s.replace(/[*!]/g, '').trim(),
    required,
    weight: required ? 2 : 1,
  };
}

function matchQuality(kind) {
  switch (kind) {
    case 'exact':   return 1.0;
    case 'phrase':  return 1.0;
    case 'partial': return 0.6;
    default:        return 0;
  }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function matchSkill({
  skill,
  text,
  tokens,
  detectedSet,
  skillsSection,
  experienceSection,
  partial,
}) {
  // Path 1: pre-extracted set hit.
  if (detectedSet.has(skill)) {
    return finishMatch({
      skill, text, tokens, kind: 'exact',
      skillsSection, experienceSection,
    });
  }

  // Path 2: phrase-bounded substring (existing behavior, with the same
  // _ → space|.|- variants the original scorer tried).
  const variants = [skill, skill.replace(/_/g, ' '), skill.replace(/_/g, '.'), skill.replace(/_/g, '-')];
  for (const v of variants) {
    if (containsPhrase(text, v)) {
      return finishMatch({
        skill, text, tokens, kind: 'phrase',
        skillsSection, experienceSection,
      });
    }
  }

  // Path 3: similarity-based partial match for typos / unknown forms.
  if (partial) {
    let bestSim = 0;
    for (const t of tokens) {
      const r = Math.max(t.length, skill.length) / Math.max(1, Math.min(t.length, skill.length));
      if (r > 1.6) continue;
      const s = ngramSimilarity(t, skill);
      if (s > bestSim) bestSim = s;
      if (bestSim >= 0.92) break;       // early exit on near-identity
    }
    if (bestSim >= 0.85) {
      const out = finishMatch({
        skill, text, tokens, kind: 'partial',
        skillsSection, experienceSection,
      });
      out.partialSimilarity = bestSim;
      return out;
    }
  }

  return {
    matched: false,
    matchKind: 'none',
    frequency: 0,
    inSkillsSection: false,
    inExperienceSection: false,
    recency: 0,
  };
}

function finishMatch({ skill, text, tokens, kind, skillsSection, experienceSection }) {
  const frequency = countOccurrences(tokens, skill);
  const inSkills = skillsSection ? skillsSection.tokenSet.has(skill) : false;
  const inExp = experienceSection ? experienceSection.tokenSet.has(skill) : false;

  return {
    matched: true,
    matchKind: kind,
    frequency,
    inSkillsSection: inSkills,
    inExperienceSection: inExp,
    recency: detectRecency(text, skill),
  };
}

function countOccurrences(tokens, skill) {
  // Skill might be multi-token after canonicalization (e.g. "google_cloud").
  // For frequency we count both raw token equality and the underscore-split
  // form's first token; this is intentionally a coarse signal.
  const head = skill.split(/[_\s.-]/)[0];
  let n = 0;
  for (const t of tokens) {
    if (t === skill || t === head) n += 1;
  }
  return n;
}

/**
 * Recency in [0,1]. We look for a year next to a skill mention. Recent =
 * ≤ 2 years old → 1; ≤ 5 years → 0.7; older → linear decay; no year → 0.4
 * (we don't know, but the skill *is* mentioned, so don't punish hard).
 */
const NOW_YEAR = new Date().getFullYear();

function detectRecency(text, skill) {
  if (!text || !skill) return 0;
  // Window of ±60 chars around each skill mention; cheapest scan possible.
  const needle = skill.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m).replace(/_/g, '[\\s._-]+');
  const re = new RegExp(`(.{0,80})\\b${needle}\\b(.{0,80})`, 'gi');
  let best = -Infinity;
  let m;
  while ((m = re.exec(text)) !== null) {
    const window = `${m[1]} ${m[2]}`;
    const yearMatches = window.match(/\b(19|20)\d{2}\b/g);
    if (!yearMatches) continue;
    for (const ys of yearMatches) {
      const y = parseInt(ys, 10);
      if (!Number.isFinite(y) || y > NOW_YEAR + 1 || y < 1980) continue;
      best = Math.max(best, y);
    }
  }
  if (!Number.isFinite(best)) return 0.4;

  const age = Math.max(0, NOW_YEAR - best);
  if (age <= 2) return 1;
  if (age <= 5) return 0.7;
  if (age <= 10) return 0.4;
  return 0.2;
}

/**
 * Proficiency in [0,1].
 *
 * Combines:
 *   - log-scaled frequency vs. doc length (more mentions = higher signal,
 *     but with diminishing returns so listing the same skill 50 times in
 *     a "skills" page bullet doesn't dominate)
 *   - section bonuses (skills page + experience section both lift)
 *   - recency
 *
 * Capped at 1 so callers can multiply through cleanly.
 */
function estimateProficiency({
  frequency,
  tokenCount,
  inSkillsSection,
  inExperienceSection,
  recency,
}) {
  if (!frequency) return 0;

  // log1p(freq) saturates quickly; divide by log1p of a "lots of mentions"
  // baseline to land in [0,~1].
  const freqSignal = Math.min(1, Math.log1p(frequency) / Math.log1p(8));
  const sectionBonus = (inSkillsSection ? 0.15 : 0) + (inExperienceSection ? 0.2 : 0);

  // Weighted blend; each input is already in [0,1]-ish.
  const raw = 0.5 * freqSignal + 0.3 * recency + sectionBonus;
  return clamp01(raw);
}

module.exports = { score, parseSkillList, normalizeSkillList };
