function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(score) {
  const n = normalizeNumber(score);
  return Math.min(1, Math.max(0, n));
}

function weightedAverage(parts) {
  if (!parts.length) return 0;
  let sumW = 0;
  let sum = 0;
  for (const { weight, score } of parts) {
    const w = normalizeNumber(weight);
    sumW += w;
    sum += w * normalizeNumber(score);
  }
  return sumW === 0 ? 0 : sum / sumW;
}

/**
 * Confidence ratio of matched / expected items, clamped to [0, 1].
 * Convention: when nothing is expected, treat as fully confident (1).
 */
function computeConfidence(matched, expected) {
  const m = Math.max(0, normalizeNumber(matched));
  const e = Math.max(0, normalizeNumber(expected));
  if (e === 0) return 1;
  return clamp01(m / e);
}

module.exports = {
  normalizeNumber,
  clamp01,
  weightedAverage,
  computeConfidence,
};
