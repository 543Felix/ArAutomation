const asyncHandler = require('../../utils/async-handler');
const matchingService = require('./matching.service');

const rank = asyncHandler(async (req, res) => {
  const { candidates = [], weights = {} } = req.body;
  const ranked = await matchingService.rankCandidates(candidates, weights);
  res.json({ ranked });
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'matching', status: 'ready' });
});

module.exports = {
  rank,
  status,
};
