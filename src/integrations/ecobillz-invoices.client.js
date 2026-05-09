const { requestJson } = require('../utils/http-client');
const AppError = require('../utils/app-error');
const { ecobillzUrl, paths } = require('../config/ecobillz-api');
const { ecobillzResultArray } = require('./ecobillz-response.util');

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    const serial =
      typeof v === 'string'
        ? v
        : v instanceof Date
          ? v.toISOString().slice(0, 10)
          : String(v);
    url.searchParams.set(k, serial);
  });
  return url.toString();
}

/**
 * GET Ecobillz `/invoices` — `{ error, result }` list (invoice docs).
 */
async function fetchInvoices(params = {}) {
  const endpoint = ecobillzUrl(paths.INVOICES);
  if (!endpoint) {
    throw new AppError('ECOBILLZ_API_BASE_URL is not configured', 500, {
      code: 'MISSING_CONFIGURATION',
    });
  }

  const url = buildUrl(endpoint, params);
  const body = await requestJson(url, { method: 'GET' });
  return ecobillzResultArray(body);
}

module.exports = {
  fetchInvoices,
};
