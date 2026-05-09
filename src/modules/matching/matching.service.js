const { weightedAverage, clamp01 } = require('../../utils/scoring');

function scoreCandidate(candidate, weights) {
  const parts = Object.entries(weights || {}).map(([key, weight]) => ({
    weight,
    score: clamp01(candidate?.signals?.[key] ?? 0),
  }));
  return clamp01(weightedAverage(parts));
}

async function rankCandidates(candidates, weights) {
  const ranked = (candidates || []).map((c) => ({
    id: c.id,
    score: scoreCandidate(c, weights),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

module.exports = {
  scoreCandidate,
  rankCandidates,
};
