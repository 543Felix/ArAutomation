const asyncHandler = require('../../utils/async-handler');
const documentService = require('./document.service');
const pdfService = require('./pdf.service');

const metadata = asyncHandler(async (req, res) => {
  const meta = await documentService.registerMetadata(req.body);
  res.status(201).json({ meta });
});

const enqueuePdf = asyncHandler(async (req, res) => {
  await pdfService.enqueuePdfJob(req.body);
  res.status(202).json({ queued: true });
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'document', status: 'ready' });
});

module.exports = {
  metadata,
  enqueuePdf,
  status,
};
