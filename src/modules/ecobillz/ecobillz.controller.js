const asyncHandler = require('../../utils/async-handler');
const AppError = require('../../utils/app-error');
const ecobillzService = require('./ecobillz.service');

const arPostedEntries = asyncHandler(async (req, res) => {
  const payload = await ecobillzService.fetchArPostedEntries(req.query);
  res.json(payload);
});

const invoices = asyncHandler(async (req, res) => {
  const payload = await ecobillzService.fetchInvoices(req.query);
  res.json(payload);
});

const getChequesPost = asyncHandler(async (req, res) => {
  const payload = await ecobillzService.fetchGetChequesFromBody(req.body);
  res.json(payload);
});

const getChequesGet = asyncHandler(async (req, res) => {
  let chequeDetails;
  try {
    chequeDetails = JSON.parse(req.query.chequeDetails);
  } catch {
    throw new AppError('chequeDetails query param must be valid JSON', 422, {
      code: 'INVALID_JSON',
    });
  }
  if (!Array.isArray(chequeDetails)) {
    throw new AppError('chequeDetails must be a JSON array', 422, { code: 'VALIDATION_ERROR' });
  }

  const payload = await ecobillzService.fetchGetChequesFromBody({
    merchantId: req.query.merchantId,
    outletId: req.query.outletId,
    chequeDetails,
  });
  res.json(payload);
});

const status = asyncHandler(async (_req, res) => {
  res.json({ module: 'ecobillz', status: 'ready' });
});

module.exports = {
  arPostedEntries,
  invoices,
  getChequesPost,
  getChequesGet,
  status,
};
