const asyncHandler = require('../../utils/async-handler');
const invoiceService = require('./invoice.service');

const preview = asyncHandler(async (req, res) => {
  const summary = await invoiceService.summarizeInvoice(req.body);
  res.json({ summary });
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'invoice', status: 'ready' });
});

module.exports = {
  preview,
  status,
};
