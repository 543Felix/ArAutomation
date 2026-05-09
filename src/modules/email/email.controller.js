const asyncHandler = require('../../utils/async-handler');
const emailService = require('./email.service');

const enqueue = asyncHandler(async (req, res) => {
  const result = await emailService.queueOutbound(req.body);
  res.status(202).json(result);
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'email', status: 'ready' });
});

module.exports = {
  enqueue,
  status,
};
