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

function toDate(v) {
  if (v == null || v === '') return undefined;
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function pickDefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, val]) => val !== undefined));
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

/**
 * Maps one Ecobillz posted-entry row to our persist shape (includes extended API fields).
 */
function mapPostedRowToRecord(row, { merchantIdStr, outletIdStr, groupIdentifier }) {
  const invoiceNo = row.taxInvoiceNo || row.no;
  if (!invoiceNo) return null;

  const invoiceDate = toDate(row.businessDate) || toDate(row.date);
  const amount = Number(row.total ?? row.amount) || 0;
  const linkedCheques = normalizeChequeDetailsFromRow(row);

  const idPart = groupIdentifier != null ? String(groupIdentifier) : '';
  const arId = idPart ? `${idPart}:${invoiceNo}` : String(invoiceNo);

  const base = {
    arId,
    invoiceNo: String(invoiceNo),
    invoiceDate,
    amount,
    merchantId: row.merchantId != null ? String(row.merchantId) : merchantIdStr,
    outletId: row.outletId != null ? String(row.outletId) : outletIdStr,
    arrivalDate: toDate(row.arrivalDate),
    departureDate: toDate(row.departureDate),
    businessDate: toDate(row.businessDate),
    chequeDetails: linkedCheques,
  };

  const extended = pickDefined({
    sourceRowId: row._id != null ? String(row._id) : undefined,
    documentNo: row.no != null ? String(row.no) : undefined,
    guestFullName: row.fullName != null ? String(row.fullName) : undefined,
    guestId: row.guestId != null ? String(row.guestId) : undefined,
    billingIdentifier: row.identifier != null ? String(row.identifier) : undefined,
    roomNo: row.roomNo != null ? String(row.roomNo) : undefined,
    taxInvoiceNo: row.taxInvoiceNo != null ? String(row.taxInvoiceNo) : undefined,
    taxInvoiceDate: toDate(row.date),
    confirmationNo: row.confNo != null ? String(row.confNo) : undefined,
    lineDescription: row.description != null ? String(row.description) : undefined,
    companyName: row.companyName != null ? String(row.companyName) : undefined,
    customer: row.customer && typeof row.customer === 'object' ? row.customer : undefined,
    folioType: row.folioType != null ? String(row.folioType) : undefined,
    hsnDescription: row.hsnDescription != null ? String(row.hsnDescription) : undefined,
    hsnCode: row.hsnCode != null ? String(row.hsnCode) : undefined,
    grossAmount:
      row.grossAmount != null && row.grossAmount !== '' ? Number(row.grossAmount) : undefined,
    cgst: row.cgst != null && row.cgst !== '' ? Number(row.cgst) : undefined,
    sgst: row.sgst != null && row.sgst !== '' ? Number(row.sgst) : undefined,
    sourceCreatedAt: toDate(row.createdAt),
    sourceUpdatedAt: toDate(row.updatedAt),
    transCode: row.transCode != null ? String(row.transCode) : undefined,
    reservationNo: row.reservationNo != null ? String(row.reservationNo) : undefined,
    remarks: row.remarks != null ? String(row.remarks) : undefined,
    outletChecks: row.outletChecks !== undefined ? row.outletChecks : undefined,
  });

  return { ...base, ...extended };
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
        const mapped = mapPostedRowToRecord(row, {
          merchantIdStr,
          outletIdStr,
          groupIdentifier: identifier,
        });
        if (mapped) rows.push(mapped);
      }
    }
  }
  return rows;
}

/** Already-flat Ecobillz / legacy rows mapped into upsert shape */
function mapFlatRecords(raw, merchantIdStr, outletIdStr) {
  return raw
    .map((r) =>
      mapPostedRowToRecord(r, {
        merchantIdStr,
        outletIdStr,
        groupIdentifier: r.identifier ?? r._id,
      }),
    )
    .filter(Boolean)
    .filter((r) => r.invoiceNo);
}

function normalizeArRecords(raw, merchantIdStr, outletIdStr) {
  if (!raw.length) return [];
  const first = raw[0];
  if (first && Array.isArray(first.customer)) {
    return flattenGroupedPostedEntries(raw, merchantIdStr, outletIdStr);
  }
  return mapFlatRecords(raw, merchantIdStr, outletIdStr);
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
  mapPostedRowToRecord,
};
