const asyncHandler = require('../../utils/async-handler');
const arService = require('./ar.service');
const emailService = require('../email/email.service');
const arProcessingQueueService = require('../jobs/ar-processing/queue.service');

const list = asyncHandler(async (req, res) => {
  const { status, merchantId, outletId, fromDate, toDate, page, limit } = req.query;
  const result = await arService.listEntries({
    status,
    merchantId,
    outletId,
    fromDate,
    toDate,
    page,
    limit,
  });
  res.json(result);
});

const detail = asyncHandler(async (req, res) => {
  const result = await arService.getEntryDetail(req.params.id);
  res.json(result);
});

const sendEmail = asyncHandler(async (req, res) => {
  const result = await emailService.enqueueManualSendForArEntry(req.params.id, req.body);
  res.status(202).json(result);
});

const triggerRun = asyncHandler(async (req, res) => {
  const { merchantId, outletId, fromDate, toDate } = req.body;
  const jobId = await arProcessingQueueService.scheduleProcessTarget({
    merchantId,
    outletId,
    fromDate,
    toDate,
  });
  res.status(202).json({ queued: true, jobId });
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'ar', status: 'ready' });
});

module.exports = {
  list,
  detail,
  sendEmail,
  triggerRun,
  status,
};
