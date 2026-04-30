/**
 * Feature extractor: convert per-scorer outputs into a flat numeric vector
 * suitable for an optional ranking model. The rule-based pipeline is the
 * source of truth; this layer is purely additive.
 *
 * Conventions:
 *   - Every feature is a finite number in a stable order.
 *   - Booleans become 0/1.
 *   - Per-skill aggregates are summarized (max, mean) so the vector size
 *     doesn't explode with the JD's skill count.
 *   - Missing scorers produce zeros for all of their features (so the
 *     vector is the same shape across calls).
 *
 * `FEATURE_NAMES` is exported for the ranker so we always know what each
 * dimension means.
 */

const FEATURE_NAMES = [
  // skill
  'skill.fit', 'skill.matchedRatio', 'skill.requiredCoverage',
  'skill.proficiency.mean', 'skill.proficiency.max',
  'skill.recency.mean', 'skill.recency.max',
  'skill.exactCount', 'skill.partialCount',

  // keyword
  'keyword.fit', 'keyword.hits', 'keyword.total', 'keyword.stuffingCapped',

  // experience
  'experience.fit', 'experience.detectedYears', 'experience.relevantYears',
  'experience.irrelevantYears', 'experience.mismatchPenalty',

  // semantic
  'semantic.fit', 'semantic.cosine',

  // penalty
  'penalty.fit',
  'penalty.jobHopping', 'penalty.careerGaps', 'penalty.overqualified',

  // meta / interaction
  'meta.requiredMissingCount', 'meta.totalSkillCount',
];

function extractFeatures({ scorers = {}, weights = {}, meta = {} } = {}) {
  const f = {};
  for (const n of FEATURE_NAMES) f[n] = 0;

  // ---- skill ----
  if (scorers.skill) {
    const s = scorers.skill;
    f['skill.fit'] = num(s.fit);

    const totalSkills = (s.details && s.details.length) || meta.totalSkillCount || 0;
    f['meta.totalSkillCount'] = totalSkills;
    f['skill.matchedRatio'] = totalSkills ? num(s.matched.length / totalSkills) : 0;

    const reqItems = (s.details || []).filter((d) => d.required);
    const reqMatched = reqItems.filter((d) => d.matched).length;
    f['skill.requiredCoverage'] = reqItems.length ? reqMatched / reqItems.length : 1;

    const profs = (s.details || []).map((d) => d.proficiency || 0);
    f['skill.proficiency.mean'] = mean(profs);
    f['skill.proficiency.max'] = max(profs);

    const recs = (s.details || []).map((d) => d.recency || 0);
    f['skill.recency.mean'] = mean(recs);
    f['skill.recency.max'] = max(recs);

    f['skill.exactCount'] = (s.details || []).filter((d) => d.matchKind === 'exact' || d.matchKind === 'phrase').length;
    f['skill.partialCount'] = (s.details || []).filter((d) => d.matchKind === 'partial').length;

    f['meta.requiredMissingCount'] = (s.requiredMissing && s.requiredMissing.length) || 0;
  }

  // ---- keyword ----
  if (scorers.keyword) {
    const k = scorers.keyword;
    f['keyword.fit'] = num(k.fit);
    f['keyword.hits'] = num(k.hits);
    f['keyword.total'] = num(k.total);
    f['keyword.stuffingCapped'] = num(k.stuffing?.capped);
  }

  // ---- experience ----
  if (scorers.experience) {
    const e = scorers.experience;
    f['experience.fit'] = num(e.fit);
    f['experience.detectedYears'] = num(e.detected);
    f['experience.relevantYears'] = num(e.relevantYears);
    f['experience.irrelevantYears'] = num(e.irrelevantYears);
    f['experience.mismatchPenalty'] = num(e.mismatchPenalty, 1);
  }

  // ---- semantic ----
  if (scorers.semantic) {
    f['semantic.fit'] = num(scorers.semantic.fit);
    f['semantic.cosine'] = num(scorers.semantic.similarity);
  }

  // ---- penalty ----
  if (scorers.penalty) {
    const p = scorers.penalty;
    f['penalty.fit'] = num(p.fit, 1);
    f['penalty.jobHopping'] = bool(p.signals?.jobHopping?.detected);
    f['penalty.careerGaps'] = bool(p.signals?.careerGaps?.detected);
    f['penalty.overqualified'] = bool(p.signals?.overqualification?.detected);
  }

  return {
    names: FEATURE_NAMES,
    values: FEATURE_NAMES.map((n) => f[n]),
    map: f,
    weights,
  };
}

function num(x, fallback = 0) {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function bool(x) { return x ? 1 : 0; }
function mean(xs) {
  if (!xs || !xs.length) return 0;
  let s = 0;
  for (const x of xs) s += num(x);
  return s / xs.length;
}
function max(xs) {
  if (!xs || !xs.length) return 0;
  let m = -Infinity;
  for (const x of xs) if (num(x) > m) m = num(x);
  return Number.isFinite(m) ? m : 0;
}

module.exports = { extractFeatures, FEATURE_NAMES };
