/**
 * Composite ATS scorer.
 *
 *   final = Σ (scorer.fit × scorer.weight)   where Σ weights = 100
 *
 * What's the same as v1:
 *   - Public API: `scoreApplication({ job, resumeText, resumeSkills, weights })`
 *   - Return shape: `{ score, breakdown }` with the original breakdown keys
 *     (`skillScore`, `keywordScore`, `experienceScore`, `matchedSkills`,
 *     `missingSkills`, `keywordHits`, `keywordTotal`, `detectedYears`,
 *     `requiredYears`, `weights`).
 *   - `DEFAULT_WEIGHTS = { skill: 50, keyword: 30, experience: 20 }`.
 *
 * What's new (additive):
 *   - Pre-tokenization: we call `parseStructured` once and pass the
 *     structured view into every scorer.
 *   - Two new scorers — `semantic`, `penalty` — wired in but with default
 *     weight 0 so existing callers' totals don't shift. Callers that want
 *     them blended in pass `weights: { skill, keyword, experience, semantic, penalty }`.
 *   - Penalties multiply the rule-based total (e.g. severe job-hopping
 *     dampens `score`) when `penalty` weight is > 0. With weight 0, the
 *     penalty signal is reported in the breakdown but doesn't move the
 *     headline number.
 *   - Feature vector + optional ML score in `breakdown.features` /
 *     `breakdown.ml` for downstream ranking experiments.
 *
 * Cache: callers that score many applications against one job can pass a
 * shared `jobContext` from `precomputeJobContext(job)` to avoid recomputing
 * keywords, embeddings, weighted skill list per resume.
 */

const { canonicalize } = require('./synonyms');
const {
  parseSkillList,
  parseStructured,
  topKeywords,
  tokenize,
} = require('./normalize');
const { embedText } = require('./embeddings');
const skillScorer = require('./scorers/skillScorer');
const keywordScorer = require('./scorers/keywordScorer');
const experienceScorer = require('./scorers/experienceScorer');
const penaltyScorer = require('./scorers/penaltyScorer');
const semanticScorer = require('./scorers/semanticScorer');
const { extractFeatures } = require('./featureExtractor');
const ranker = require('./ranker');

const DEFAULT_WEIGHTS = { skill: 50, keyword: 30, experience: 20 };

// Internal — what we use when weights aren't fully specified. Semantic
// and penalty default to 0 so the headline score is unchanged for legacy
// callers.
const INTERNAL_WEIGHTS = {
  skill: 50,
  keyword: 30,
  experience: 20,
  semantic: 0,
  penalty: 0,
};

function precomputeJobContext(job) {
  const jobText = `${job.title || ''} ${job.description || ''}`;
  const jobSkills = skillScorer.normalizeSkillList(null, parseSkillList(job.skills));
  const jobKeywords = topKeywords(jobText, 25);
  const jobEmbedding = embedText(jobText, tokenize(jobText));
  const jobSkillCanonicals = jobSkills.map((s) => canonicalize(s.skill));

  return {
    jobText,
    jobSkills,                 // [{ skill, required, weight }]
    jobSkillCanonicals,
    jobKeywords,
    jobEmbedding,
    minExperience: job.minExperience || 0,
  };
}

function scoreApplication({ job, resumeText, resumeSkills, weights = DEFAULT_WEIGHTS, jobContext }) {
  const w = { ...INTERNAL_WEIGHTS, ...(weights || {}) };
  const totalWeight = w.skill + w.keyword + w.experience + w.semantic;
  if (totalWeight === 0) {
    return {
      score: 0,
      breakdown: {
        skill: null,
        keyword: null,
        experience: null,
        weights: w,
      },
    };
  }

  const ctx = jobContext || precomputeJobContext(job);
  const structured = parseStructured(resumeText || '');

  // ---- run scorers ----
  const skill = skillScorer.score({
    jobSkills: ctx.jobSkillCanonicals,
    weightedJobSkills: ctx.jobSkills,
    resumeText: structured.normalizedText,
    resumeSkills,
    structured,
  });

  const keyword = keywordScorer.score({
    jobText: ctx.jobText,
    jobKeywords: ctx.jobKeywords,
    resumeText: structured.normalizedText,
    structured,
  });

  const experience = experienceScorer.score({
    resumeText: structured.normalizedText,
    requiredYears: ctx.minExperience,
    structured,
    jobSkills: ctx.jobSkillCanonicals,
  });

  const semantic = semanticScorer.score({
    jobText: ctx.jobText,
    resumeText: structured.normalizedText,
    structured,
    jobEmbedding: ctx.jobEmbedding,
  });

  const penalty = penaltyScorer.score({
    resumeText: structured.normalizedText,
    structured,
    requiredYears: ctx.minExperience,
  });

  // ---- aggregate (rule-based, source of truth) ----
  const skillScore = Math.round(skill.fit * w.skill);
  const keywordScore = Math.round(keyword.fit * w.keyword);
  const experienceScore = Math.round(experience.fit * w.experience);
  const semanticScore = Math.round(semantic.fit * w.semantic);

  let pre = skillScore + keywordScore + experienceScore + semanticScore;

  // Penalty applies as a multiplicative factor when its weight is nonzero.
  // Weight=0 (default) means "report but don't subtract" — preserves v1
  // numbers exactly.
  let penaltyMultiplier = 1;
  if (w.penalty > 0 && penalty.applicable) {
    const strength = Math.min(1, w.penalty / 100);
    penaltyMultiplier = 1 - strength * (1 - penalty.fit);
    pre = Math.round(pre * penaltyMultiplier);
  }

  const total = Math.max(0, Math.min(100, pre));

  // ---- feature extraction + optional ML score ----
  const features = extractFeatures({
    scorers: { skill, keyword, experience, semantic, penalty },
    weights: w,
    meta: { totalSkillCount: ctx.jobSkillCanonicals.length },
  });
  const mlScore = ranker.predict(features);

  return {
    score: total,
    breakdown: {
      // ---------- legacy fields (v1) — unchanged ----------
      skillScore,
      keywordScore,
      experienceScore,
      matchedSkills: skill.matched,
      missingSkills: skill.missing,
      keywordHits: keyword.hits,
      keywordTotal: keyword.total,
      detectedYears: experience.detected,
      requiredYears: experience.required,
      weights: w,

      // ---------- additive (v2) ----------
      semanticScore,
      penaltyMultiplier: round3(penaltyMultiplier),
      requiredMissing: skill.requiredMissing || [],
      skillDetails: skill.details,
      proficiency: skill.proficiency,
      keywords: keyword.keywords,
      stuffing: keyword.stuffing,
      experienceDetail: {
        totalYears: round3(experience.totalYears),
        relevantYears: round3(experience.relevantYears),
        irrelevantYears: round3(experience.irrelevantYears),
        perSkillYears: experience.perSkillYears,
        mismatchPenalty: round3(experience.mismatchPenalty),
      },
      semantic: {
        similarity: semantic.similarity,
        fit: round3(semantic.fit),
      },
      penalties: penalty.signals,

      // ---------- feature vector + ML auxiliary ----------
      features: { names: features.names, values: features.values },
      ml: mlScore,
    },
  };
}

function round3(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

module.exports = {
  scoreApplication,
  precomputeJobContext,
  DEFAULT_WEIGHTS,
};
