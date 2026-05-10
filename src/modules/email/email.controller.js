const asyncHandler = require('../../utils/async-handler');
const emailService = require('./email.service');
const emailSyncService = require('./email.sync.service');

const enqueue = asyncHandler(async (req, res) => {
  const result = await emailService.queueOutbound(req.body);
  res.status(202).json(result);
});

const sendForAr = asyncHandler(async (req, res) => {
  const result = await emailService.enqueueManualSendForArEntry(req.params.arId, req.body);
  res.status(202).json(result);
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'email', status: 'ready' });
});

const postThreadMessage = asyncHandler(async (req, res) => {
  const result = await emailService.addEmailMessage(req.body);
  res.status(result.duplicate ? 200 : 201).json(result);
});

const getEmailThread = asyncHandler(async (req, res) => {
  const thread = await emailService.getEmailThread(req.params.arId);
  res.json(thread);
});

const syncEmailThread = asyncHandler(async (req, res) => {
  const result = await emailSyncService.syncEmailThread(req.params.arId, req.body || {});
  res.status(200).json(result);
});

module.exports = {
  enqueue,
  sendForAr,
  status,
  postThreadMessage,
  getEmailThread,
  syncEmailThread,
};
