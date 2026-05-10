const arPostingClient = require('../../integrations/ar-posting.client');
const invoiceDetailsClient = require('../../integrations/invoice-details.client');
const ecobillzInvoicesClient = require('../../integrations/ecobillz-invoices.client');
const { resolveEcobillzInvoiceQuery } = require('../../utils/tax-invoice-date-range');
const {
  arEntryRepository,
  invoiceRepository,
  checkRepository,
} = require('../../data/repositories');
const { toObjectId } = require('../../data/mongo/object-id.util');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { computeConfidence } = require('../../utils/scoring');
const {
  AR_STATUS,
  AR_LOG_LEVEL,
  CONFIDENCE_THRESHOLD,
} = require('./ar.constants');
const { companyPdfBundleKey } = require('./ar-bundle-key.util');

function startOfYesterdayUtc(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function startOfTodayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getDailyTargets() {
  const raw = process.env.AR_DAILY_TARGETS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn('AR_DAILY_TARGETS is not valid JSON', { message: err.message });
    return [];
  }
}

async function pushLog(arEntryId, step, message, level = AR_LOG_LEVEL.INFO, meta) {
  await arEntryRepository.pushLog(arEntryId, { step, message, level, at: new Date(), meta });
}

async function persistRawArRecord(record, target) {
  const merchantOid = toObjectId(record.merchantId) || toObjectId(target.merchantId);
  const outletOid = toObjectId(record.outletId) || toObjectId(target.outletId);

  const result = await arEntryRepository.upsertPendingFromRaw(record, merchantOid, outletOid);
  if (!result.ok) {
    throw new AppError('AR record missing merchantId/outletId', 400);
  }
  return result.doc;
}

async function processArEntry(arEntryId) {
  const entry = await arEntryRepository.findById(arEntryId);
  if (!entry) {
    throw new AppError(`AR entry ${arEntryId} not found`, 404);
  }

  await pushLog(entry._id, 'process.start', 'Begin AR entry processing');

  let invoice = await invoiceRepository.findMatchingInvoice({
    invoiceNo: entry.invoiceNo,
    merchantId: entry.merchantId,
    outletId: entry.outletId,
    invoiceDate: entry.invoiceDate,
  });

  if (!invoice) {
    try {
      const q = resolveEcobillzInvoiceQuery({
        merchantId: String(entry.merchantId),
        outletId: String(entry.outletId),
        invoiceNo: entry.invoiceNo,
        invoiceDate: entry.invoiceDate,
        arrivalDate: entry.arrivalDate,
        departureDate: entry.departureDate,
        businessDate: entry.businessDate ?? entry.invoiceDate,
      });
      const remoteList = await ecobillzInvoicesClient.fetchInvoices(q);
      const match = remoteList.find(
        (d) => String(d.no ?? d.taxInvoiceNo ?? d.invoiceNo) === String(entry.invoiceNo),
      );
      if (match) {
        await invoiceRepository.upsertFromEcobillz(match, entry.merchantId, entry.outletId);
        invoice = await invoiceRepository.findMatchingInvoice({
          invoiceNo: entry.invoiceNo,
          merchantId: entry.merchantId,
          outletId: entry.outletId,
          invoiceDate: entry.invoiceDate,
        });
      }
    } catch (err) {
      logger.warn('Ecobillz invoices fallback failed', {
        invoiceNo: entry.invoiceNo,
        message: err.message,
      });
    }
  }

  if (!invoice) {
    await arEntryRepository.setInvoiceNotFound(entry._id);
    return { arEntryId: String(entry._id), status: AR_STATUS.INVOICE_NOT_FOUND };
  }

  await arEntryRepository.setInvoiceMatched(entry._id, invoice._id);

  let expectedCheckNos = [];
  let docsFromCheques = [];
  if (entry.chequeDetails?.length) {
    try {
      docsFromCheques = await invoiceDetailsClient.fetchGetCheques({
        merchantId: String(entry.merchantId),
        outletId: String(entry.outletId),
        chequeDetails: entry.chequeDetails.map((c) => ({
          chequeNo: c.chequeNo,
          chequeDate: c.chequeDate,
        })),
      });
    } catch (err) {
      await pushLog(
        entry._id,
        'checks.fetch',
        `Ecobillz get-cheques failed: ${err.message}`,
        AR_LOG_LEVEL.ERROR,
      );
      throw err;
    }
  }
  expectedCheckNos = invoiceDetailsClient.extractCheckNumbersFromChequeDocs(docsFromCheques);

  const matchedChecks = await checkRepository.findByCheckNumbers({
    checkNos: expectedCheckNos,
    merchantId: entry.merchantId,
    outletId: entry.outletId,
  });

  const expected = expectedCheckNos.length;
  const matched = matchedChecks.length;
  const missing = Math.max(0, expected - matched);
  const confidenceScore = computeConfidence(matched, expected);

  const matchedNos = new Set(matchedChecks.map((c) => String(c.checkNo)));
  const missingCheckNos = expectedCheckNos.filter((n) => !matchedNos.has(String(n)));

  const nextStatus =
    confidenceScore >= CONFIDENCE_THRESHOLD
      ? AR_STATUS.READY_FOR_PDF
      : AR_STATUS.MISSING_DOCUMENTS;

  await arEntryRepository.applyScoringUpdate(
    entry._id,
    {
      expectedChecks: expected,
      matchedChecks: matched,
      missingChecks: missing,
      missingCheckNos,
      confidenceScore,
      status: nextStatus,
    },
    {
      step: 'score.compute',
      level: AR_LOG_LEVEL.INFO,
      message: `confidence=${confidenceScore.toFixed(3)} matched=${matched}/${expected} → ${nextStatus}`,
      at: new Date(),
    },
  );

  return {
    arEntryId: String(entry._id),
    status: nextStatus,
    confidenceScore,
    matched,
    expected,
    missing,
  };
}

async function processForTarget({ merchantId, outletId, fromDate, toDate }) {
  const merchantOid = toObjectId(merchantId);
  const outletOid = toObjectId(outletId);
  if (!merchantOid || !outletOid) {
    throw new AppError('merchantId and outletId are required', 400);
  }

  const records = await arPostingClient.fetchArData({
    fromDate,
    toDate,
    merchantId: String(merchantOid),
    outletId: String(outletOid),
  });

  logger.info('Fetched AR records', {
    merchantId: String(merchantOid),
    outletId: String(outletOid),
    count: records.length,
  });

  const results = [];
  for (const record of records) {
    let entry;
    try {
      entry = await persistRawArRecord(record, { merchantId: merchantOid, outletId: outletOid });
    } catch (err) {
      logger.error('Failed to persist AR record', {
        invoiceNo: record?.invoiceNo,
        message: err.message,
      });
      continue;
    }

    try {
      const out = await processArEntry(entry._id);
      results.push(out);
    } catch (err) {
      await pushLog(entry._id, 'process.error', err.message, AR_LOG_LEVEL.ERROR);
      logger.error('Failed to process AR entry', {
        arEntryId: String(entry._id),
        message: err.message,
      });
    }
  }

  const readyIds = results
    .filter((r) => r.status === AR_STATUS.READY_FOR_PDF)
    .map((r) => r.arEntryId)
    .filter(Boolean);

  if (readyIds.length > 0) {
    const pdfQueueService = require('../jobs/pdf-creation/queue.service');
    const entries = await arEntryRepository.findByIds(readyIds);
    const groups = new Map();
    for (const e of entries) {
      const k = companyPdfBundleKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(String(e._id));
    }
    for (const groupIds of groups.values()) {
      groupIds.sort();
      await pdfQueueService.schedulePdfCreation({ arEntryIds: groupIds });
      await pushLog(
        groupIds[0],
        'pdf.enqueue',
        `Enqueued company PDF job (${groupIds.length} invoice(s))`,
      );
    }
  }

  return { processed: results.length, results };
}

async function runDaily({ fromDate, toDate } = {}) {
  const targets = getDailyTargets();
  if (targets.length === 0) {
    logger.warn('AR_DAILY_TARGETS is empty; daily run has nothing to do');
    return { processed: 0, targets: 0 };
  }

  const from = fromDate ? new Date(fromDate) : startOfYesterdayUtc();
  const to = toDate ? new Date(toDate) : startOfTodayUtc();

  let total = 0;
  for (const target of targets) {
    try {
      const r = await processForTarget({ ...target, fromDate: from, toDate: to });
      total += r.processed;
    } catch (err) {
      logger.error('Daily target failed', { target, message: err.message });
    }
  }

  return { processed: total, targets: targets.length };
}

async function listEntries({ status, merchantId, outletId, fromDate, toDate, page = 1, limit = 20 }) {
  const filter = {};
  if (status) filter.status = status;
  if (merchantId && toObjectId(merchantId)) filter.merchantId = toObjectId(merchantId);
  if (outletId && toObjectId(outletId)) filter.outletId = toObjectId(outletId);
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const lim = Math.min(200, Math.max(1, Number(limit)));

  const [{ groups, identifierTotal }, arEntryCount] = await Promise.all([
    arEntryRepository.aggregateGroupedByIdentifier(filter, skip, lim),
    arEntryRepository.count(filter),
  ]);

  /**
   * Same shape as Ecobillz ARPosted aggregate: one doc per company `identifier`,
   * each with `customer[]` grouped by `guestId`, each with `rows`, `count`, `total`.
   * `total` is the number of identifier buckets matching the filter (for pagination).
   */
  return {
    entries: groups,
    total: identifierTotal,
    arEntryCount,
    page: Number(page),
    limit: lim,
  };
}

async function getEntryDetail(id) {
  const entry = await arEntryRepository.findById(id);
  if (!entry) {
    throw new AppError('AR entry not found', 404);
  }
  return {
    entry,
    missingDocuments: {
      checkCount: entry.missingChecks,
      checkNos: entry.missingCheckNos,
      invoiceLinked: entry.invoiceLinked,
    },
    confidenceScore: entry.confidenceScore,
    finalPdfUrl: entry.finalPdfUrl,
  };
}

async function markEmailSent(id) {
  const entry = await arEntryRepository.findById(id);
  if (!entry) {
    throw new AppError('AR entry not found', 404);
  }
  if (entry.status !== AR_STATUS.PDF_GENERATED && entry.status !== AR_STATUS.EMAIL_SENT) {
    throw new AppError(`Cannot send email when status=${entry.status}`, 409);
  }

  await arEntryRepository.markEmailSent(entry._id);
  return { id: String(entry._id), status: AR_STATUS.EMAIL_SENT, finalPdfUrl: entry.finalPdfUrl };
}

module.exports = {
  processForTarget,
  processArEntry,
  runDaily,
  listEntries,
  getEntryDetail,
  markEmailSent,
  pushLog,
};
