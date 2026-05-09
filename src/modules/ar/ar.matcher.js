const { DEFAULT_INVOICE_DATE_PROXIMITY_DAYS } = require('./ar.constants');

function getProximityDays() {
  const n = Number(process.env.AR_INVOICE_DATE_PROXIMITY_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INVOICE_DATE_PROXIMITY_DAYS;
}

function dateRangeAround(date, days) {
  if (!date) return null;
  const d = new Date(date);
  const ms = days * 24 * 60 * 60 * 1000;
  return { $gte: new Date(d.getTime() - ms), $lte: new Date(d.getTime() + ms) };
}

/**
 * Build a Mongoose query that matches an invoice for an AR entry, allowing
 * the invoice date to be within ±N days of the AR entry's invoice date.
 */
function buildInvoiceMatchQuery({ invoiceNo, merchantId, outletId, invoiceDate, proximityDays }) {
  const days = proximityDays ?? getProximityDays();
  const query = { invoiceNo, merchantId, outletId };
  const range = dateRangeAround(invoiceDate, days);
  if (range) query.invoiceDate = range;
  return query;
}

function buildCheckMatchQuery({ checkNo, merchantId, outletId }) {
  return { checkNo, merchantId, outletId };
}

module.exports = {
  buildInvoiceMatchQuery,
  buildCheckMatchQuery,
  getProximityDays,
};
