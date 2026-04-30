const { canonicalize } = require('../synonyms');
const { containsPhrase, parseSkillList } = require('../normalize');

/**
 * Skill match scorer.
 *
 * Inputs:
 *   - jobSkills: array of canonical skill keys (already canonicalized)
 *   - resumeText: full resume text
 *   - resumeSkills: optional pre-extracted canonical skill keys from the resume
 *
 * Strategy:
 *   1) For each required skill, accept a hit if (a) it's in the resume's
 *      pre-extracted set, OR (b) any of its surface forms is a token-bounded
 *      substring of the resume text.
 *   2) Returns the proportional fit, plus matched/missing lists for the UI.
 */
function score({ jobSkills, resumeText, resumeSkills }) {
  const required = jobSkills.map(canonicalize);
  if (required.length === 0) {
    return { fit: 0, matched: [], missing: [], applicable: false };
  }

  const detected = new Set((resumeSkills || []).map(canonicalize));
  const matched = [];
  const missing = [];

  for (const skill of required) {
    const hit =
      detected.has(skill) ||
      // Accept the canonical form OR any surface form via containsPhrase.
      // Cheap path: canonical key is usually one token.
      containsPhrase(resumeText, skill) ||
      // Try common spaces/dots variants too.
      containsPhrase(resumeText, skill.replace(/_/g, ' ')) ||
      containsPhrase(resumeText, skill.replace(/_/g, '.')) ||
      containsPhrase(resumeText, skill.replace(/_/g, '-'));

    if (hit) matched.push(skill);
    else missing.push(skill);
  }

  return {
    fit: matched.length / required.length,
    matched,
    missing,
    applicable: true,
  };
}

module.exports = { score, parseSkillList };
