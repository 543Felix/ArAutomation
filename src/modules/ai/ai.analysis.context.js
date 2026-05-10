const { TRACKING_EVENT_STATUS } = require('../ar/ar-tracking.constants');

const DEFAULT_BODY_CHARS = Number(process.env.AI_AR_ANALYSIS_MAX_EMAIL_CHARS) || 1500;
const MAX_TRACKING_EVENTS = 25;
const MAX_MERGED_TRACKING_LINES =
  Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_TRACKING_LINES) > 0
    ? Math.min(120, Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_TRACKING_LINES))
    : 50;
const MAX_PORTFOLIO_ROWS =
  Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_INVOICE_ROWS) > 0
    ? Math.min(80, Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_INVOICE_ROWS))
    : 25;

function pickCustomerName(entry) {
  if (!entry) return 'Unknown';
  const c = entry.customer && typeof entry.customer === 'object' ? entry.customer : {};
  const fromCustomer =
    c.companyName ||
    c.name ||
    c.fullName ||
    (typeof c.email === 'string' ? c.email.split('@')[0] : '');
  const raw =
    String(entry.companyName || '').trim() ||
    String(entry.guestFullName || '').trim() ||
    String(fromCustomer || '').trim();
  return raw || 'Unknown';
}

function formatAmount(entry) {
  if (!entry) return '';
  const n = Number(entry.amount);
  if (!Number.isFinite(n)) return String(entry.amount ?? '');
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAmountNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n ?? '');
  return x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function missingDocsLines(entry, missingMeta) {
  const lines = [];
  const nos = Array.isArray(entry?.missingCheckNos) ? entry.missingCheckNos : [];
  if (nos.length) {
    lines.push(`Missing cheque / bank documents (check nos): ${nos.slice(0, 50).join(', ')}`);
  }
  const mc = Number(missingMeta?.checkCount ?? entry?.missingChecks ?? 0);
  if (mc > 0 && !nos.length) {
    lines.push(`${mc} cheque-linked document(s) outstanding`);
  }
  if (missingMeta && missingMeta.invoiceLinked === false) {
    lines.push('Invoice not linked in system');
  }
  return lines.length ? lines.join('\n') : '(none listed)';
}

function derivePaymentStatus(timeline = []) {
  const statuses = new Set((timeline || []).map((e) => e.status));
  if (statuses.has(TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED)) {
    return 'FULL_PAYMENT_COMPLETED — balance cleared per tracking.';
  }
  if (statuses.has(TRACKING_EVENT_STATUS.PARTIAL_PAYMENT)) {
    return 'PARTIAL_PAYMENT — partial settlement recorded.';
  }
  if (statuses.has(TRACKING_EVENT_STATUS.PAYMENT_INITIATED)) {
    return 'PAYMENT_INITIATED — customer or finance indicated payment in progress.';
  }
  if (
    statuses.has(TRACKING_EVENT_STATUS.CLIENT_RESPONDED) ||
    statuses.has(TRACKING_EVENT_STATUS.RECEIVED_BY_CLIENT)
  ) {
    return 'Customer engaged — receipt / reply recorded; payment outcome unclear.';
  }
  if (statuses.has(TRACKING_EVENT_STATUS.ESCALATION_TRIGGERED)) {
    return 'ESCALATION_TRIGGERED — SLA / follow-up escalation logged.';
  }
  if (statuses.has(TRACKING_EVENT_STATUS.EMAIL_SENT)) {
    return 'Collection email sent — awaiting meaningful payment / dispute signals.';
  }
  return 'No payment-completed milestones in tracking yet.';
}

function formatTrackingEvents(timeline) {
  const sorted = [...(timeline || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const slice = sorted.slice(-MAX_TRACKING_EVENTS);
  return slice
    .map((e) => {
      const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '';
      const label = e.label || e.status || '';
      const desc = (e.description || '').replace(/\s+/g, ' ').trim();
      return `- ${ts} [${e.status}] ${label}${desc ? ` — ${desc.slice(0, 280)}` : ''}`;
    })
    .join('\n');
}

function truncateBody(text, maxChars) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

/**
 * Last `limit` messages by time; bodies truncated (newest last in output).
 */
function formatLatestEmails(messages, limit = 3, bodyMax = DEFAULT_BODY_CHARS) {
  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const picked = sorted.slice(0, limit).reverse();
  return picked
    .map((m, idx) => {
      const ts = m.timestamp ? new Date(m.timestamp).toISOString() : '';
      const dir = m.direction || '';
      const inv =
        m.analysisInvoiceLabel != null && String(m.analysisInvoiceLabel).trim()
          ? `[Invoice ${String(m.analysisInvoiceLabel).trim()}] `
          : '';
      const subj = `${inv}${(m.subject || '').slice(0, 200)}`;
      const ai =
        m.aiAnalysis && typeof m.aiAnalysis === 'object'
          ? ` | prior AI: intent="${String(m.aiAnalysis.intent || '')}" summary="${truncateBody(m.aiAnalysis.summary, 200)}"`
          : '';
      const body = truncateBody(m.body, bodyMax);
      return `[${idx + 1}] ${ts} ${dir}\nFrom: ${m.from}\nSubject: ${subj}${ai}\nBody:\n${body}`;
    })
    .join('\n\n---\n\n');
}

function formatMergedTrackingForCustomer(trackDocs, maxLines = MAX_MERGED_TRACKING_LINES) {
  const flat = [];
  for (const doc of trackDocs || []) {
    const inv = String(doc.invoiceNo || '').trim() || String(doc.arEntryId || '');
    for (const e of doc.timeline || []) {
      flat.push({ invoiceNo: inv, e });
    }
  }
  flat.sort((a, b) => new Date(a.e.timestamp).getTime() - new Date(b.e.timestamp).getTime());
  const slice = flat.slice(-maxLines);
  return slice
    .map(({ invoiceNo, e }) => {
      const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '';
      const label = e.label || e.status || '';
      const desc = (e.description || '').replace(/\s+/g, ' ').trim();
      return `- [Invoice ${invoiceNo}] ${ts} [${e.status}] ${label}${desc ? ` — ${desc.slice(0, 240)}` : ''}`;
    })
    .join('\n');
}

function mergedPaymentStatusCodeFromTracks(trackDocs) {
  const codes = (trackDocs || []).map((d) => derivePaymentStatusCode(d.timeline || []));
  if (!codes.length) return 'OUTSTANDING_OR_UNKNOWN';
  if (codes.every((c) => c === 'PAID_FULL')) return 'PAID_FULL';
  if (codes.some((c) => c === 'PAID_PARTIAL')) return 'PAID_PARTIAL';
  if (codes.some((c) => c === 'PAYMENT_INITIATED')) return 'PAYMENT_INITIATED';
  return 'OUTSTANDING_OR_UNKNOWN';
}

function mergedPaymentNarrative(trackDocs, mergedCode) {
  const codes = (trackDocs || []).map((d) => derivePaymentStatusCode(d.timeline || []));
  const tally = {
    PAID_FULL: 0,
    PAID_PARTIAL: 0,
    PAYMENT_INITIATED: 0,
    OUTSTANDING_OR_UNKNOWN: 0,
  };
  for (const c of codes) tally[c] += 1;
  const parts = [];
  if (tally.PAID_FULL) parts.push(`${tally.PAID_FULL} invoice(s) show full payment in tracking`);
  if (tally.PAID_PARTIAL) parts.push(`${tally.PAID_PARTIAL} with partial payment signals`);
  if (tally.PAYMENT_INITIATED) parts.push(`${tally.PAYMENT_INITIATED} with payment initiated`);
  if (tally.OUTSTANDING_OR_UNKNOWN) parts.push(`${tally.OUTSTANDING_OR_UNKNOWN} without settlement milestones`);

  const base =
    parts.length > 0
      ? `Across ${codes.length} tracked invoice row(s): ${parts.join('; ')}.`
      : 'No per-invoice tracking loaded.';

  if (mergedCode === 'PAID_FULL') return `${base} Aggregate read: all invoices fully settled per timelines.`;
  return `${base} Aggregate read: collections still active on at least one invoice unless timelines are incomplete.`;
}

function aggregateWorkflowSummary(entries) {
  const counts = {};
  for (const e of entries || []) {
    const s = e.status != null ? String(e.status) : 'UNKNOWN';
    counts[s] = (counts[s] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, v]) => `${v}× ${k}`)
    .join(', ');
}

function formatInvoicesPortfolio(entries, maxRows = MAX_PORTFOLIO_ROWS) {
  return (entries || [])
    .slice(0, maxRows)
    .map((e) => {
      const missing = Number(e.missingChecks || 0);
      const conf =
        e.confidenceScore != null && Number.isFinite(Number(e.confidenceScore))
          ? `${Math.round(Number(e.confidenceScore) * 100)}%`
          : 'n/a';
      return `- ${String(e.invoiceNo || '')}: amt ${formatAmountNumber(e.amount)}, status=${String(e.status || '')}, missing cheque slots=${missing}, doc confidence≈${conf}`;
    })
    .join('\n');
}

function collectMessagesForCustomer(emailThreads) {
  const out = [];
  for (const t of emailThreads || []) {
    const inv = String(t.invoiceNo || '').trim();
    for (const m of t.messages || []) {
      out.push({ ...m, analysisInvoiceLabel: inv || undefined });
    }
  }
  return out;
}

/**
 * Customer cohort (multiple AR rows): merged timelines, global last 3 emails, portfolio totals.
 *
 * @param {object} params
 * @param {object} params.anchorEntry — Mongo AR anchor document (for naming / scope)
 * @param {object[]} params.entries — lean AR rows in cohort (sorted newest-first upstream)
 * @param {object[]} params.trackingDocs — lean tracking docs from `findByArEntryIds`
 * @param {object[]} params.emailThreads — lean email threads from `findByArEntryIds`
 */
function buildCustomerAnalysisContext({
  anchorEntry,
  entries,
  trackingDocs,
  emailThreads,
}) {
  const list = Array.isArray(entries) && entries.length ? entries : anchorEntry ? [anchorEntry] : [];
  const anchor =
    list.find((e) => String(e._id) === String(anchorEntry?._id)) || list[0] || anchorEntry;

  const totalAmt = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalAmountText = `${formatAmountNumber(totalAmt)} (sum of ${list.length} AR row(s))`;

  const confidences = list
    .map((e) => Number(e.confidenceScore))
    .filter((n) => Number.isFinite(n));
  let confidenceScoreText = 'Not available';
  if (confidences.length) {
    const minC = Math.min(...confidences);
    const maxC = Math.max(...confidences);
    confidenceScoreText =
      minC === maxC
        ? `${Math.round(minC * 100)}% (document matching — same across portfolio)`
        : `${Math.round(minC * 100)}–${Math.round(maxC * 100)}% range across invoices`;
  }

  const missingDocsList = [];
  const missingLines = [];
  for (const e of list) {
    const inv = String(e.invoiceNo || '').trim();
    const nos = Array.isArray(e.missingCheckNos) ? e.missingCheckNos.map(String) : [];
    if (nos.length) {
      missingLines.push(`${inv}: missing cheque refs — ${nos.slice(0, 30).join(', ')}`);
      for (const n of nos) missingDocsList.push(`${inv}:${n}`);
    } else if (Number(e.missingChecks || 0) > 0) {
      missingLines.push(`${inv}: ${e.missingChecks} cheque-linked slot(s) outstanding`);
    }
  }
  const missingDocsText =
    missingLines.length > 0 ? missingLines.join('\n') : '(none listed across cohort)';

  const anyMissingDocuments = missingLines.length > 0 || list.some((e) => String(e.status) === 'MISSING_DOCUMENTS');

  const mergedCode = mergedPaymentStatusCodeFromTracks(trackingDocs);
  const paymentStatusText = mergedPaymentNarrative(trackingDocs, mergedCode);
  const workflowStatusText = aggregateWorkflowSummary(list) || '(unknown)';

  const worstStatus = list.some((e) => String(e.status) === 'MISSING_DOCUMENTS')
    ? 'MISSING_DOCUMENTS'
    : list[0]?.status
      ? String(list[0].status)
      : '';

  const threadsFlat = collectMessagesForCustomer(emailThreads);
  const trackingEventsText =
    (trackingDocs || []).some((d) => (d.timeline || []).length > 0)
      ? formatMergedTrackingForCustomer(trackingDocs)
      : '(no tracking events across cohort)';

  const invoicesPortfolioText =
    list.length > MAX_PORTFOLIO_ROWS
      ? `${formatInvoicesPortfolio(list, MAX_PORTFOLIO_ROWS)}\n… (${list.length - MAX_PORTFOLIO_ROWS} more row(s) omitted — scope capped)`
      : formatInvoicesPortfolio(list, MAX_PORTFOLIO_ROWS);

  return {
    analysisScope: 'customer',
    invoiceNo: list.length === 1 ? String(list[0].invoiceNo || '') : `${list.length} invoices (portfolio)`,
    invoicesPortfolioText,
    totalAmountText,
    amountText: totalAmountText,
    arEntryCount: list.length,
    customerName: pickCustomerName(anchor),
    missingDocsText,
    missingDocsList,
    confidenceScoreText,
    trackingEventsText,
    latestEmailRepliesText: formatLatestEmails(threadsFlat, 3, DEFAULT_BODY_CHARS),
    paymentStatusText,
    workflowStatusText,
    paymentStatusCode: mergedCode,
    rawEntryStatus: worstStatus,
    anyMissingDocuments,
  };
}

/**
 * @param {object} params
 * @param {object} params.detail — `ar.service.getEntryDetail` shape
 * @param {object} params.tracking — `tracking.service.getTrackingTimeline` shape
 * @param {object} params.thread — `email.service.getEmailThread` shape
 */
function buildArAnalysisContext({ detail, tracking, thread }) {
  const entry = detail?.entry;
  const missingMeta = detail?.missingDocuments || {};

  const timeline = tracking?.timeline || [];
  const paymentStatusText = derivePaymentStatus(timeline);
  const workflowStatusText = entry?.status ? String(entry.status) : '';

  const confRaw = entry?.confidenceScore;
  const confidenceScoreText =
    confRaw != null && Number.isFinite(Number(confRaw))
      ? `${Math.round(Number(confRaw) * 100)}% (model confidence from document matching)`
      : 'Not available';

  const missingDocsList = [];
  if (Array.isArray(entry?.missingCheckNos)) {
    missingDocsList.push(...entry.missingCheckNos.map(String));
  }

  return {
    analysisScope: 'single_ar',
    invoiceNo: entry?.invoiceNo != null ? String(entry.invoiceNo) : '',
    amountText: formatAmount(entry),
    customerName: pickCustomerName(entry),
    missingDocsText: missingDocsLines(entry, missingMeta),
    missingDocsList,
    confidenceScoreText,
    trackingEventsText: timeline.length ? formatTrackingEvents(timeline) : '(no tracking events)',
    latestEmailRepliesText: formatLatestEmails(thread?.messages, 3, DEFAULT_BODY_CHARS),
    paymentStatusText,
    workflowStatusText,
    paymentStatusCode: derivePaymentStatusCode(timeline),
    rawEntryStatus: workflowStatusText,
    anyMissingDocuments:
      missingDocsList.length > 0 || String(entry?.status || '') === 'MISSING_DOCUMENTS',
  };
}

function derivePaymentStatusCode(timeline = []) {
  const statuses = new Set((timeline || []).map((e) => e.status));
  if (statuses.has(TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED)) return 'PAID_FULL';
  if (statuses.has(TRACKING_EVENT_STATUS.PARTIAL_PAYMENT)) return 'PAID_PARTIAL';
  if (statuses.has(TRACKING_EVENT_STATUS.PAYMENT_INITIATED)) return 'PAYMENT_INITIATED';
  return 'OUTSTANDING_OR_UNKNOWN';
}

module.exports = {
  buildArAnalysisContext,
  buildCustomerAnalysisContext,
  DEFAULT_BODY_CHARS,
  MAX_TRACKING_EVENTS,
};
