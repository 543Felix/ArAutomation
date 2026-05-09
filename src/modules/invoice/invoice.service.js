const { invoiceRepository } = require('../../data/repositories');
const ecobillzInvoicesClient = require('../../integrations/ecobillz-invoices.client');
const {
  getEcobillzMerchantId,
  getEcobillzOutletId,
} = require('../../config/ecobillz-api');
const { resolveEcobillzInvoiceQuery } = require('../../utils/tax-invoice-date-range');

async function findMatchingInvoice(args) {
  return invoiceRepository.findMatchingInvoice(args);
}

async function findByIdLean(id) {
  return invoiceRepository.findByIdLean(id);
}

async function summarizeInvoice(payload) {
  return {
    reference: payload?.invoiceNo ?? null,
    total: payload?.amount ?? null,
  };
}

/** GET `{ECOBILLZ_API_BASE_URL}/invoices` (tenant IDs default from env when omitted). */
async function fetchInvoicesFromEcobillz(filters = {}) {
  const merchantId = filters.merchantId || getEcobillzMerchantId();
  const outletId = filters.outletId || getEcobillzOutletId();
  const params = resolveEcobillzInvoiceQuery({ ...filters, merchantId, outletId });
  return ecobillzInvoicesClient.fetchInvoices(params);
}

module.exports = {
  findMatchingInvoice,
  findByIdLean,
  summarizeInvoice,
  fetchInvoicesFromEcobillz,
};
