const { detectYearsOfExperience } = require('../normalize');

function score({ resumeText, requiredYears }) {
  const detected = detectYearsOfExperience(resumeText);

  if (!requiredYears || requiredYears <= 0) {
    // No requirement: give partial credit for *any* signal of experience.
    return { fit: resumeText ? 0.6 : 0, detected, required: 0, applicable: false };
  }

  if (detected >= requiredYears) return { fit: 1, detected, required: requiredYears, applicable: true };
  if (detected > 0) return { fit: detected / requiredYears, detected, required: requiredYears, applicable: true };
  return { fit: 0, detected: 0, required: requiredYears, applicable: true };
}

module.exports = { score };
