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

function flattenGroupedPostedEntries(groups, merchantIdStr, outletIdStr) {
  const rows = [];
  const list = Array.isArray(groups) ? groups : [];
  for (const g of list) {
    const identifier = g.identifier || g._id;
    const customers = Array.isArray(g.customer) ? g.customer : [];
    for (const cust of customers) {
      const custRows = Array.isArray(cust.rows) ? cust.rows : [];
      for (const row of custRows) {
        const invoiceNo = row.taxInvoiceNo || row.no;
        if (!invoiceNo) continue;

        const invoiceDate = row.businessDate ? new Date(row.businessDate) : undefined;
        const arrivalDate = row.arrivalDate ? new Date(row.arrivalDate) : undefined;
        const departureDate = row.departureDate ? new Date(row.departureDate) : undefined;
        const businessDate = row.businessDate ? new Date(row.businessDate) : undefined;
        const linkedCheques = normalizeChequeDetailsFromRow(row);
        rows.push({
          arId: identifier ? `${identifier}:${invoiceNo}` : invoiceNo,
          invoiceNo: String(invoiceNo),
          invoiceDate,
          amount: Number(row.total) || 0,
          merchantId: merchantIdStr,
          outletId: outletIdStr,
          ...(arrivalDate ? { arrivalDate } : {}),
          ...(departureDate ? { departureDate } : {}),
          ...(businessDate ? { businessDate } : {}),
          ...(linkedCheques.length ? { chequeDetails: linkedCheques } : {}),
        });
      }
    }
  }
  return rows;
}

function normalizeChequeDetailsFromRow(row) {
  const raw = row.chequeDetails || row.cheques || row.chequeList;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (typeof c === 'string') return { chequeNo: c, chequeDate: undefined };
      const chequeNo = c.chequeNo || c.no || c.checkNo;
      if (!chequeNo) return null;
      const rawDate = c.chequeDate || c.date;
      const chequeDate = rawDate ? new Date(rawDate) : undefined;
      return { chequeNo: String(chequeNo), chequeDate };
    })
    .filter(Boolean);
}

/** Already-flat Ecobillz / legacy rows mapped into upsert shape */
function mapFlatRecords(raw, merchantIdStr, outletIdStr) {
  return raw.map((r) => ({
    ...r,
    invoiceNo: r.invoiceNo || r.taxInvoiceNo || r.no,
    merchantId: r.merchantId || merchantIdStr,
    outletId: r.outletId || outletIdStr,
    invoiceDate: r.invoiceDate ? new Date(r.invoiceDate) : r.businessDate ? new Date(r.businessDate) : undefined,
    ...(r.arrivalDate ? { arrivalDate: new Date(r.arrivalDate) } : {}),
    ...(r.departureDate ? { departureDate: new Date(r.departureDate) } : {}),
    ...(r.businessDate ? { businessDate: new Date(r.businessDate) } : {}),
    amount: Number(r.amount ?? r.total) || 0,
  }));
}

function normalizeArRecords(raw, merchantIdStr, outletIdStr) {
  if (!raw.length) return [];
  const first = raw[0];
  if (first && Array.isArray(first.customer)) {
    return flattenGroupedPostedEntries(raw, merchantIdStr, outletIdStr);
  }
  return mapFlatRecords(raw, merchantIdStr, outletIdStr).filter((r) => r.invoiceNo);
}

/**
 * GET Ecobillz `/ar-posted-entries` — resolves `{ error, result }` and grouped Ecobillz shape into upsert-friendly rows.
 */
async function fetchArData({ fromDate, toDate, merchantId, outletId }) {
  const endpoint = ecobillzUrl(paths.AR_POSTED_ENTRIES);
  if (!endpoint) {
    throw new AppError(
      'ECOBILLZ_API_BASE_URL is not configured (optional paths: ECOBILLZ_AR_POSTED_ENTRIES_PATH, …)',
      500,
      {
        code: 'MISSING_CONFIGURATION',
      },
    );
  }

  const url = buildUrl(endpoint, { fromDate, toDate, merchantId, outletId });
  const body = await requestJson(url, { method: 'GET' });
  const raw = ecobillzResultArray(body);
  return normalizeArRecords(raw, String(merchantId), String(outletId));
}

module.exports = {
  fetchArData,
};
