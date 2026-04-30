/**
 * Penalty scorer — surfaces *negative* signals so they can subtract from
 * (or contextualize) the headline ATS score.
 *
 * Detects:
 *   - Job hopping            : many short tenures relative to total years
 *   - Career gaps            : long unexplained gaps between adjacent roles
 *   - Overqualification      : detected years ≫ required years for a role
 *
 * Output shape mirrors the other scorers: `fit ∈ [0,1]` (1 = no penalty,
 * 0 = severe), plus a `penalty ∈ [0,1]` convenience and a `signals` map
 * for transparency in the UI.
 *
 * `requiredYears` is optional; without it overqualification can't be
 * judged and the scorer simply ignores that signal.
 */

const { extractDateRanges } = require('./experienceScorer');

function score({
  resumeText,
  structured,
  requiredYears,
  // Tunables — exposed so we can A/B without code changes later.
  hopShortTenureMonths = 14,
  hopRatioThreshold = 0.5,            // ≥ this fraction of jobs short → hopping
  gapMonthsThreshold = 12,
  overqualMultiplier = 2.0,           // detected ≥ 2× required → overqualified
} = {}) {
  const text =
    structured?.sections?.experience?.normalizedText ||
    structured?.normalizedText ||
    String(resumeText || '');

  const ranges = sortRanges(extractDateRanges(text));

  const hopping = detectJobHopping(ranges, { hopShortTenureMonths, hopRatioThreshold });
  const gaps = detectGaps(ranges, { gapMonthsThreshold });
  const over = detectOverqualification(ranges, { requiredYears, overqualMultiplier });

  // Combine the three penalties multiplicatively so each one *can* veto on
  // its own, but a single mild signal doesn't crash the score.
  const fit = clamp01(hopping.factor * gaps.factor * over.factor);

  return {
    fit,
    applicable: ranges.length > 0,
    penalty: round3(1 - fit),
    signals: {
      jobHopping: hopping,
      careerGaps: gaps,
      overqualification: over,
    },
    ranges,
  };
}

function sortRanges(ranges) {
  return [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
}

function detectJobHopping(ranges, { hopShortTenureMonths, hopRatioThreshold }) {
  if (ranges.length < 3) {
    return { detected: false, factor: 1, shortTenures: 0, jobs: ranges.length };
  }
  let short = 0;
  for (const r of ranges) {
    if (r.years * 12 <= hopShortTenureMonths) short += 1;
  }
  const ratio = short / ranges.length;
  const detected = ratio >= hopRatioThreshold;
  // Soft penalty: linear in (ratio − threshold), capped at -25%.
  const factor = detected ? Math.max(0.75, 1 - 0.6 * (ratio - hopRatioThreshold)) : 1;
  return { detected, ratio: round3(ratio), shortTenures: short, jobs: ranges.length, factor: round3(factor) };
}

function detectGaps(ranges, { gapMonthsThreshold }) {
  if (ranges.length < 2) return { detected: false, factor: 1, gaps: [] };
  const gaps = [];
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1];
    const cur = ranges[i];
    const gapYears = cur.start - prev.end;
    if (gapYears * 12 >= gapMonthsThreshold) {
      gaps.push({ from: prev.end, to: cur.start, months: Math.round(gapYears * 12) });
    }
  }
  // 0 gaps → 1, 1 gap → 0.92, 2+ → 0.85 floor.
  const factor = gaps.length === 0 ? 1 : gaps.length === 1 ? 0.92 : 0.85;
  return { detected: gaps.length > 0, gaps, factor };
}

function detectOverqualification(ranges, { requiredYears, overqualMultiplier }) {
  if (!requiredYears || ranges.length === 0) {
    return { detected: false, factor: 1, totalYears: 0, requiredYears: 0 };
  }
  const totalYears = ranges.reduce((s, r) => s + r.years, 0);
  const detected = totalYears >= requiredYears * overqualMultiplier;
  // Overqualification is mostly a signal, not a strong veto. -8% at the
  // threshold; keeps shrinking as the gap widens, with a 0.85 floor.
  const factor = detected ? Math.max(0.85, 0.92 - 0.02 * (totalYears - requiredYears * overqualMultiplier)) : 1;
  return { detected, totalYears: round3(totalYears), requiredYears, factor: round3(factor) };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round3(x) { return Math.round(x * 1000) / 1000; }

module.exports = { score };
