const { requestJson } = require('../utils/http-client');
const AppError = require('../utils/app-error');
const { ecobillzUrl, paths } = require('../config/ecobillz-api');
const { ecobillzResultArray } = require('./ecobillz-response.util');

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, typeof v === 'string' ? v : String(v));
  });
  return url.toString();
}

function serializeChequeDetailsForQuery(chequeDetails) {
  const normalized = (chequeDetails || []).map((c) => {
    const chequeNo = c.chequeNo || c.no;
    const out = { chequeNo: String(chequeNo) };
    const d = c.chequeDate ?? c.date;
    if (d) {
      const dateStr =
        typeof d === 'string'
          ? d.slice(0, 10)
          : d instanceof Date
            ? d.toISOString().slice(0, 10)
            : String(d).slice(0, 10);
      out.chequeDate = dateStr;
    }
    return out;
  });
  return JSON.stringify(normalized);
}

/**
 * GET Ecobillz `/get-cheques` with `chequeDetails` JSON array query param (matches Postman-style Ecobillz API).
 * @returns {Promise<object[]>} `result` rows (invoice/cheque-linked docs).
 */
async function fetchGetCheques({ merchantId, outletId, chequeDetails }) {
  const endpoint = ecobillzUrl(paths.GET_CHEQUES);
  if (!endpoint) {
    throw new AppError('ECOBILLZ_API_BASE_URL is not configured', 500, {
      code: 'MISSING_CONFIGURATION',
    });
  }

  const details = Array.isArray(chequeDetails) ? chequeDetails : [];
  if (details.length === 0) {
    return [];
  }

  const chequeDetailsParam = serializeChequeDetailsForQuery(details);
  const url = buildUrl(endpoint, { merchantId, outletId, chequeDetails: chequeDetailsParam });
  const body = await requestJson(url, { method: 'GET' });
  return ecobillzResultArray(body);
}

/** Derive identifiers to match against local `checkNo` store from Ecobillz doc shape (`no`, etc.). */
function extractCheckNumbersFromChequeDocs(docs) {
  const nos = new Set();
  for (const doc of docs || []) {
    if (doc.no) nos.add(String(doc.no));
    if (doc.chequeNo) nos.add(String(doc.chequeNo));
  }
  return [...nos];
}

module.exports = {
  fetchGetCheques,
  extractCheckNumbersFromChequeDocs,
};
