/**
 * Mirrors legacy Moment logic for tax-invoice window queries (server local timezone).
 *
 * If arrival & departure exist and arrival < departure:
 *   [startOf(arrival), endOf(departure)]
 * Else (requires businessDate):
 *   [startOf(businessDate - 1 day), endOf(businessDate) + 8 hours]
 */

function parseReportDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59, 999);
}

/**
 * @param {object} report
 * @param {Date|string|undefined} report.arrivalDate
 * @param {Date|string|undefined} report.departureDate
 * @param {Date|string|undefined} report.businessDate
 * @returns {{ fromDate: Date, toDate: Date }|null}
 */
function buildTaxInvoiceDateRange(report = {}) {
  const arrivalDate = parseReportDate(report.arrivalDate);
  const departureDate = parseReportDate(report.departureDate);
  const businessDate = parseReportDate(report.businessDate);

  if (
    arrivalDate &&
    departureDate &&
    arrivalDate.getTime() < departureDate.getTime()
  ) {
    return {
      fromDate: startOfLocalDay(arrivalDate),
      toDate: endOfLocalDay(departureDate),
    };
  }

  if (!businessDate) return null;

  const prior = new Date(businessDate.getTime());
  prior.setDate(prior.getDate() - 1);
  const fromDate = startOfLocalDay(prior);
  const toDate = new Date(endOfLocalDay(businessDate).getTime() + 8 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

function serializeHttpDate(value) {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function invoiceDateParam(value) {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Fills `fromDate` / `toDate` when both are absent, using arrival / departure / business fields.
 */
function applyTaxInvoiceRangeToParams(params = {}) {
  const next = { ...params };
  const fromEmpty = next.fromDate == null || next.fromDate === '';
  const toEmpty = next.toDate == null || next.toDate === '';
  if (!fromEmpty || !toEmpty) return next;

  const range = buildTaxInvoiceDateRange({
    arrivalDate: next.arrivalDate,
    departureDate: next.departureDate,
    businessDate: next.businessDate,
  });
  if (!range) return next;

  next.fromDate = range.fromDate.toISOString();
  next.toDate = range.toDate.toISOString();
  return next;
}

/**
 * Builds query params for Ecobillz `GET /invoices` (drops internal report-only keys).
 */
function resolveEcobillzInvoiceQuery(input = {}) {
  const withRange = applyTaxInvoiceRangeToParams(input);
  const params = {
    merchantId: withRange.merchantId,
    outletId: withRange.outletId,
  };
  if (withRange.invoiceNo != null && withRange.invoiceNo !== '') {
    params.invoiceNo = String(withRange.invoiceNo);
  }
  const idate = invoiceDateParam(withRange.invoiceDate);
  if (idate) params.invoiceDate = idate;

  const fd = serializeHttpDate(withRange.fromDate);
  const td = serializeHttpDate(withRange.toDate);
  if (fd) params.fromDate = fd;
  if (td) params.toDate = td;

  return params;
}

module.exports = {
  buildTaxInvoiceDateRange,
  applyTaxInvoiceRangeToParams,
  resolveEcobillzInvoiceQuery,
};
