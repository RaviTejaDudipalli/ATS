/**
 * Semantic similarity between the JD and the resume.
 *
 * We use the in-process `embeddings` module (hashed BoW + char n-grams)
 * rather than a transformer model — see embeddings.js for the rationale.
 *
 * The point of this scorer is to catch resumes that *talk like* the JD
 * even when individual skills don't match by exact phrase. It's
 * intentionally lower-weighted in the orchestrator because it can be
 * fooled by similar-sounding text.
 */

const { embedText, similarity } = require('../embeddings');
const { tokenize } = require('../normalize');

function score({
  jobText,
  resumeText,
  structured,
  jobEmbedding,            // optional precomputed embedding for the JD
} = {}) {
  if (!jobText || !resumeText) {
    return { fit: 0, similarity: 0, applicable: false };
  }

  const jobVec = jobEmbedding || embedText(jobText, tokenize(jobText));
  const resumeTokens = structured?.tokens || tokenize(resumeText);
  const resumeText2 = structured?.normalizedText || resumeText;
  const resumeVec = embedText(resumeText2, resumeTokens);

  const sim = similarity(jobVec, resumeVec);

  // Cosine on hashed BoW lives in roughly [0, 0.7] for typical
  // resume/JD pairs — full 1.0 only happens on duplicates. Stretch the
  // mid-range so the headline score behaves sensibly.
  const fit = clamp01((sim - 0.1) / 0.5);

  return {
    fit,
    similarity: round4(sim),
    applicable: true,
  };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round4(x) { return Math.round(x * 10000) / 10000; }

module.exports = { score };
