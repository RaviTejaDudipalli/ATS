/**
 * Optional ranking model.
 *
 * Two responsibilities:
 *
 *   1. Hold the (loadable) coefficients of a trained logistic-regression
 *      model that maps a feature vector → probability of "would shortlist".
 *
 *   2. Produce a `mlScore` ∈ [0,1] used by the orchestrator *as an
 *      auxiliary signal*. The rule-based score remains the source of
 *      truth — the ML score is exposed in the breakdown for transparency
 *      and (optionally) blended in with a small weight.
 *
 * Default behavior (no trained model loaded): we ship a hand-tuned linear
 * model whose coefficients are derived from the same scorer outputs. This
 * is deterministic, transparent, and intentionally close to the rule-based
 * formula — an ML model that disagrees wildly with the rules in
 * production should be loaded explicitly, not by default.
 *
 * Loading a real model later: `loadModel({ coefficients, intercept })`
 * accepts JSON in the shape produced by sklearn's `LogisticRegression`,
 * so retraining offline and shipping a JSON blob is trivial.
 */

const { FEATURE_NAMES } = require('./featureExtractor');

const DEFAULT_MODEL = {
  // Hand-tuned linear weights. Sum is ≈ 1.6 on a perfectly matching
  // candidate; sigmoid pushes that toward ~0.83.
  intercept: -0.4,
  coefficients: {
    'skill.fit':                 1.20,
    'skill.requiredCoverage':    0.80,
    'skill.proficiency.mean':    0.30,
    'skill.recency.mean':        0.20,
    'keyword.fit':               0.50,
    'experience.fit':            0.60,
    'experience.mismatchPenalty':0.30,
    'semantic.fit':              0.30,
    'penalty.fit':               0.40,
    'meta.requiredMissingCount':-0.50,
    'penalty.jobHopping':       -0.30,
    'penalty.careerGaps':       -0.10,
  },
};

let activeModel = DEFAULT_MODEL;

function loadModel(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('ranker.loadModel: expected { intercept, coefficients }');
  }
  const intercept = Number(model.intercept) || 0;
  const coefficients = {};
  for (const [k, v] of Object.entries(model.coefficients || {})) {
    if (Number.isFinite(Number(v))) coefficients[k] = Number(v);
  }
  activeModel = { intercept, coefficients };
}

function resetModel() { activeModel = DEFAULT_MODEL; }

function predict(features) {
  if (!features || !features.map) return { score: 0, contributions: {} };
  let z = activeModel.intercept;
  const contributions = {};
  for (const name of FEATURE_NAMES) {
    const coef = activeModel.coefficients[name];
    if (!coef) continue;
    const x = Number(features.map[name]) || 0;
    const c = coef * x;
    z += c;
    contributions[name] = round4(c);
  }
  return {
    score: round4(sigmoid(z)),
    z: round4(z),
    contributions,
    model: activeModel === DEFAULT_MODEL ? 'default' : 'custom',
  };
}

function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
function round4(x) { return Math.round(x * 10000) / 10000; }

module.exports = { predict, loadModel, resetModel, DEFAULT_MODEL };
