/**
 * Composite ATS scorer.
 *
 *   final = Σ (scorer.fit × scorer.weight)   where Σ weights = 100
 *
 * Each scorer returns `fit ∈ [0,1]` plus arbitrary diagnostic data.
 * Adding a new signal = drop a file in ./scorers and add it to the pipeline.
 *
 * Weights are configurable (per-call) so we can A/B test or tune per role
 * type later without touching scorer code.
 */

const { canonicalize } = require('./synonyms');
const { parseSkillList, normalize } = require('./normalize');
const skillScorer = require('./scorers/skillScorer');
const keywordScorer = require('./scorers/keywordScorer');
const experienceScorer = require('./scorers/experienceScorer');

const DEFAULT_WEIGHTS = { skill: 50, keyword: 30, experience: 20 };

function scoreApplication({ job, resumeText, resumeSkills, weights = DEFAULT_WEIGHTS }) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    return { score: 0, breakdown: { skill: null, keyword: null, experience: null } };
  }

  const jobSkills = parseSkillList(job.skills).map(canonicalize);
  const jobText = `${job.title || ''} ${job.description || ''}`;
  const resume = normalize(resumeText || '');

  const skill = skillScorer.score({ jobSkills, resumeText: resume, resumeSkills });
  const keyword = keywordScorer.score({ jobText, resumeText: resume });
  const experience = experienceScorer.score({
    resumeText: resume,
    requiredYears: job.minExperience || 0,
  });

  const skillScore = Math.round(skill.fit * weights.skill);
  const keywordScore = Math.round(keyword.fit * weights.keyword);
  const experienceScore = Math.round(experience.fit * weights.experience);

  const total = Math.max(0, Math.min(100, skillScore + keywordScore + experienceScore));

  return {
    score: total,
    breakdown: {
      // Friendly shape for the recruiter UI; backwards-compatible with the
      // previous payload (matchedSkills / missingSkills / detectedYears / …).
      skillScore,
      keywordScore,
      experienceScore,
      matchedSkills: skill.matched,
      missingSkills: skill.missing,
      keywordHits: keyword.hits,
      keywordTotal: keyword.total,
      detectedYears: experience.detected,
      requiredYears: experience.required,
      weights,
    },
  };
}

module.exports = {
  scoreApplication,
  DEFAULT_WEIGHTS,
};
