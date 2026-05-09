const arPostingClient = require('../../integrations/ar-posting.client');
const invoiceDetailsClient = require('../../integrations/invoice-details.client');
const ecobillzInvoicesClient = require('../../integrations/ecobillz-invoices.client');
const { resolveEcobillzInvoiceQuery } = require('../../utils/tax-invoice-date-range');
const AppError = require('../../utils/app-error');
const {
  getEcobillzMerchantId,
  getEcobillzOutletId,
} = require('../../config/ecobillz-api');

function mergeEcobillzTenant(queryLike = {}) {
  const merchantId = queryLike.merchantId || getEcobillzMerchantId();
  const outletId = queryLike.outletId || getEcobillzOutletId();
  if (!merchantId || !outletId) {
    throw new AppError(
      'merchantId and outletId are required (query/body or ECOBILLZ_MERCHANT_ID / ECOBILLZ_OUTLET_ID)',
      400,
      { code: 'MISSING_MERCHANT_OUTLET' },
    );
  }
  return { ...queryLike, merchantId, outletId };
}

function queryDates(query) {
  const { fromDate, toDate } = query;
  return {
    ...(fromDate != null && fromDate !== '' ? { fromDate } : {}),
    ...(toDate != null && toDate !== '' ? { toDate } : {}),
  };
}

async function fetchArPostedEntries(query) {
  const merged = mergeEcobillzTenant(query);
  const { merchantId, outletId, fromDate, toDate } = merged;
  const records = await arPostingClient.fetchArData({
    merchantId,
    outletId,
    ...queryDates({ fromDate, toDate }),
  });
  return { records, count: records.length };
}

async function fetchInvoices(query) {
  const merged = mergeEcobillzTenant(query);
  const params = resolveEcobillzInvoiceQuery(merged);
  const invoices = await ecobillzInvoicesClient.fetchInvoices(params);
  return { invoices, count: invoices.length };
}

async function fetchGetChequesFromBody(body) {
  const { chequeDetails, merchantId, outletId } = body || {};
  const merged = mergeEcobillzTenant({ merchantId, outletId });
  const result = await invoiceDetailsClient.fetchGetCheques({
    merchantId: merged.merchantId,
    outletId: merged.outletId,
    chequeDetails,
  });
  return { result, count: result.length };
}

module.exports = {
  fetchArPostedEntries,
  fetchInvoices,
  fetchGetChequesFromBody,
};
