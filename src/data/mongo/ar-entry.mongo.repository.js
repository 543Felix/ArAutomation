const ArEntry = require('../../modules/ar/ar-entry.model');
const { AR_STATUS, AR_LOG_LEVEL } = require('../../modules/ar/ar.constants');
const { customerGroupFilterFromEntry } = require('../../modules/ar/customer-scope.util');
const { toObjectId } = require('./object-id.util');

async function pushLog(arEntryId, logDoc) {
  await ArEntry.updateOne({ _id: arEntryId }, { $push: { logs: logDoc } });
}

/** Fields synced from Ecobillz posted-entry API on every upsert (does not include workflow status). */
const SNAPSHOT_KEYS = [
  'arId',
  'invoiceNo',
  'invoiceDate',
  'amount',
  'arrivalDate',
  'departureDate',
  'businessDate',
  'chequeDetails',
  'sourceRowId',
  'documentNo',
  'guestFullName',
  'guestId',
  'billingIdentifier',
  'roomNo',
  'taxInvoiceNo',
  'taxInvoiceDate',
  'confirmationNo',
  'lineDescription',
  'companyName',
  'customer',
  'folioType',
  'hsnDescription',
  'hsnCode',
  'grossAmount',
  'cgst',
  'sgst',
  'sourceCreatedAt',
  'sourceUpdatedAt',
  'transCode',
  'reservationNo',
  'remarks',
  'outletChecks',
];

const DATE_SNAPSHOT_KEYS = new Set([
  'invoiceDate',
  'arrivalDate',
  'departureDate',
  'businessDate',
  'taxInvoiceDate',
  'sourceCreatedAt',
  'sourceUpdatedAt',
]);

function snapshotFromPostedRecord(record) {
  const out = {};
  for (const k of SNAPSHOT_KEYS) {
    if (record[k] === undefined) continue;
    let v = record[k];
    if (DATE_SNAPSHOT_KEYS.has(k) && v != null) {
      v = v instanceof Date ? v : new Date(v);
    }
    if (k === 'chequeDetails' && Array.isArray(v)) {
      out[k] = v.map((c) => ({
        chequeNo: c.chequeNo,
        ...(c.chequeDate != null
          ? {
              chequeDate:
                c.chequeDate instanceof Date ? c.chequeDate : new Date(c.chequeDate),
            }
          : {}),
      }));
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function upsertPendingFromRaw(record, targetMerchantId, targetOutletId) {
  const merchantId =
    toObjectId(record.merchantId) || toObjectId(targetMerchantId);
  const outletId = toObjectId(record.outletId) || toObjectId(targetOutletId);
  if (!merchantId || !outletId) {
    return { ok: false, reason: 'missing_merchant_or_outlet' };
  }

  const filter = {
    invoiceNo: record.invoiceNo,
    merchantId,
    outletId,
    ...(record.arId ? { arId: record.arId } : {}),
  };

  const snapshot = snapshotFromPostedRecord(record);

  const update = {
    $set: {
      ...snapshot,
      merchantId,
      outletId,
    },
    $setOnInsert: {
      status: AR_STATUS.PENDING,
      invoiceLinked: false,
      matchedChecks: 0,
      expectedChecks: 0,
      missingChecks: 0,
      missingCheckNos: [],
      confidenceScore: 0,
      logs: [],
      finalPdfUrl: null,
    },
  };

  const doc = await ArEntry.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  return { ok: true, doc };
}

async function findById(id) {
  return ArEntry.findById(id);
}

async function findByIds(ids) {
  const unique = [...new Set((ids || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!unique.length) return [];
  return ArEntry.find({ _id: { $in: unique } });
}

/**
 * All AR rows for the same customer cohort as `anchorEntry` (merchant/outlet + billing id / company name ± guest).
 * The anchor `_id` is always included; remaining rows fill by `updatedAt` (newest first) up to cap.
 */
async function findEntriesForCustomerGroup(anchorEntry) {
  const max =
    Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_ENTRIES) > 0
      ? Math.min(200, Number(process.env.AI_CUSTOMER_ANALYSIS_MAX_ENTRIES))
      : 60;
  const filter = customerGroupFilterFromEntry(anchorEntry);
  if (!filter) return [];

  if (filter._id != null) {
    const row = await ArEntry.findOne(filter).lean();
    return row ? [row] : [];
  }

  const anchorOid = toObjectId(anchorEntry._id);
  const restSlots = Math.max(0, max - 1);
  const restFilter =
    anchorOid != null ? { ...filter, _id: { $ne: anchorOid } } : { ...filter };

  const [anchorRow, others] = await Promise.all([
    anchorOid ? ArEntry.findById(anchorOid).lean() : null,
    restSlots > 0
      ? ArEntry.find(restFilter).sort({ updatedAt: -1 }).limit(restSlots).lean()
      : [],
  ]);

  const merged = [];
  const seen = new Set();
  if (anchorRow) {
    merged.push(anchorRow);
    seen.add(String(anchorRow._id));
  }
  for (const r of others || []) {
    const id = String(r._id);
    if (!seen.has(id)) {
      merged.push(r);
      seen.add(id);
    }
  }
  return merged;
}

async function setInvoiceNotFound(entryId) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: {
        status: AR_STATUS.INVOICE_NOT_FOUND,
        invoiceLinked: false,
        confidenceScore: 0,
      },
      $push: {
        logs: {
          step: 'invoice.match',
          level: AR_LOG_LEVEL.WARN,
          message: 'Invoice not found in DB',
          at: new Date(),
        },
      },
    },
  );
}

async function setInvoiceMatched(entryId, invoiceRefId) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: { invoiceLinked: true, invoiceRefId },
      $push: {
        logs: {
          step: 'invoice.match',
          level: AR_LOG_LEVEL.INFO,
          message: `Invoice matched: ${invoiceRefId}`,
          at: new Date(),
        },
      },
    },
  );
}

async function applyScoringUpdate(entryId, fields, logEntry) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: fields,
      $push: { logs: logEntry },
    },
  );
}

async function findPage(filter, skip, limit) {
  return ArEntry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
}

async function count(filter) {
  return ArEntry.countDocuments(filter);
}

/**
 * Groups stored AR entries like Ecobillz `ARPosted.aggregate`:
 *   match → sort → group(identifier+guestId)→rows → group(identifier)→customer[]
 * Pagination applies to **identifier** (company) buckets, not raw rows.
 */
async function aggregateGroupedByIdentifier(matchFilter, skipGroups, limitGroups) {
  const pipeline = [
    { $match: matchFilter },
    { $sort: { invoiceNo: 1, guestId: 1, _id: 1 } },
    {
      $group: {
        _id: {
          identifier: { $ifNull: ['$billingIdentifier', ''] },
          guestId: { $ifNull: ['$guestId', ''] },
        },
        rows: {
          $push: {
            _id: '$_id',
            no: '$documentNo',
            transCode: '$transCode',
            guestId: '$guestId',
            identifier: '$billingIdentifier',
            taxInvoiceNo: { $ifNull: ['$taxInvoiceNo', '$invoiceNo'] },
            roomNo: '$roomNo',
            confNo: '$confirmationNo',
            reservationNo: '$reservationNo',
            businessDate: '$businessDate',
            fullName: '$guestFullName',
            companyName: '$companyName',
            arrivalDate: '$arrivalDate',
            departureDate: '$departureDate',
            total: '$amount',
            description: '$lineDescription',
            remarks: '$remarks',
            outletChecks: '$outletChecks',
            invoiceNo: '$invoiceNo',
            invoiceDate: '$invoiceDate',
            taxInvoiceDate: '$taxInvoiceDate',
            folioType: '$folioType',
            status: '$status',
            confidenceScore: '$confidenceScore',
            finalPdfUrl: '$finalPdfUrl',
            merchantId: '$merchantId',
            outletId: '$outletId',
            sourceRowId: '$sourceRowId',
            arId: '$arId',
            hsnCode: '$hsnCode',
            hsnDescription: '$hsnDescription',
            grossAmount: '$grossAmount',
            cgst: '$cgst',
            sgst: '$sgst',
            /** Customer-level AI snapshot from POST /api/v1/ai/analyze/ar/:id */
            agentAnalysis: '$agentAnalysis',
          },
        },
        totalCount: { $sum: 1 },
        total: { $sum: { $ifNull: ['$amount', 0] } },
      },
    },
    { $sort: { '_id.identifier': 1, '_id.guestId': 1 } },
    {
      $group: {
        _id: '$_id.identifier',
        customer: {
          $push: {
            guestId: '$_id.guestId',
            rows: '$rows',
            count: '$totalCount',
            total: '$total',
          },
        },
        totalCount: { $sum: '$totalCount' },
        total: { $sum: '$total' },
      },
    },
    {
      $project: {
        _id: 0,
        identifier: '$_id',
        customer: 1,
        totalCount: 1,
        total: 1,
      },
    },
    { $sort: { identifier: 1 } },
    {
      $facet: {
        meta: [{ $count: 'identifierCount' }],
        data: [{ $skip: skipGroups }, { $limit: limitGroups }],
      },
    },
  ];

  const agg = await ArEntry.aggregate(pipeline).allowDiskUse(true);
  const facet = agg[0] || {};
  const identifierTotal = facet.meta?.[0]?.identifierCount ?? 0;
  const groups = facet.data ?? [];
  return { groups, identifierTotal };
}

async function markEmailSent(entryId) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: {
        status: AR_STATUS.EMAIL_SENT,
        emailSentAt: new Date(),
      },
      $push: {
        logs: {
          step: 'email.send',
          level: AR_LOG_LEVEL.INFO,
          message: 'Email marked sent',
          at: new Date(),
        },
      },
    },
  );
}

async function markEmailSentMany(entryIds, meta = {}) {
  const oids = [...new Set((entryIds || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!oids.length) return { matched: 0 };

  const logEntry = {
    step: 'email.sent',
    level: AR_LOG_LEVEL.INFO,
    message: meta.message || 'Outbound AR collection email delivered',
    at: new Date(),
  };

  const set = {
    status: AR_STATUS.EMAIL_SENT,
    emailSentAt: new Date(),
  };
  if (meta.subject) set.lastEmailSubject = String(meta.subject).slice(0, 500);
  if (meta.body) set.lastEmailBody = String(meta.body).slice(0, 20000);

  const result = await ArEntry.updateMany(
    { _id: { $in: oids } },
    { $set: set, $push: { logs: logEntry } },
  );
  return { matched: result.modifiedCount ?? result.nModified ?? 0 };
}

async function findByFinalPdfUrl(finalPdfUrl) {
  if (!finalPdfUrl) return [];
  return ArEntry.find({ finalPdfUrl }).lean();
}

async function markPdfGenerated(entryId, finalPdfUrl) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: { status: AR_STATUS.PDF_GENERATED, finalPdfUrl },
      $push: {
        logs: {
          step: 'pdf.generated',
          level: AR_LOG_LEVEL.INFO,
          message: `Merged PDF saved at ${finalPdfUrl}`,
          at: new Date(),
        },
      },
    },
  );
}

async function markPdfGeneratedMany(entryIds, finalPdfUrl) {
  const oids = [...new Set((entryIds || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!oids.length) return { matched: 0 };
  const logEntry = {
    step: 'pdf.generated',
    level: AR_LOG_LEVEL.INFO,
    message: `Merged company PDF saved at ${finalPdfUrl}`,
    at: new Date(),
  };
  const result = await ArEntry.updateMany(
    { _id: { $in: oids } },
    {
      $set: { status: AR_STATUS.PDF_GENERATED, finalPdfUrl },
      $push: { logs: logEntry },
    },
  );
  return { matched: result.modifiedCount ?? result.nModified ?? 0 };
}

async function updateTrackingSummary(arEntryId, trackingStatus) {
  const oid = toObjectId(arEntryId);
  if (!oid) return { matched: 0 };
  const result = await ArEntry.updateOne(
    { _id: oid },
    {
      $set: {
        trackingCurrentStatus: String(trackingStatus || ''),
        trackingLastUpdatedAt: new Date(),
      },
    },
  );
  return { matched: result.modifiedCount ?? result.nModified ?? 0 };
}

async function setAgentAnalysis(arEntryId, lastAnalysisPayload) {
  const oid = toObjectId(arEntryId);
  if (!oid) return { matched: 0 };
  const result = await ArEntry.updateOne(
    { _id: oid },
    {
      $set: {
        agentAnalysis: {
          lastAnalysis: lastAnalysisPayload,
          updatedAt: new Date(),
        },
      },
    },
  );
  return { matched: result.modifiedCount ?? result.nModified ?? 0 };
}

async function setAgentAnalysisMany(arEntryIds, lastAnalysisPayload) {
  const oids = [...new Set((arEntryIds || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!oids.length) return { matched: 0 };
  const result = await ArEntry.updateMany(
    { _id: { $in: oids } },
    {
      $set: {
        agentAnalysis: {
          lastAnalysis: lastAnalysisPayload,
          updatedAt: new Date(),
        },
      },
    },
  );
  return { matched: result.modifiedCount ?? result.nModified ?? 0 };
}

module.exports = {
  pushLog,
  upsertPendingFromRaw,
  findById,
  findByIds,
  findEntriesForCustomerGroup,
  setInvoiceNotFound,
  setInvoiceMatched,
  applyScoringUpdate,
  findPage,
  count,
  aggregateGroupedByIdentifier,
  markEmailSent,
  markEmailSentMany,
  findByFinalPdfUrl,
  markPdfGenerated,
  markPdfGeneratedMany,
  updateTrackingSummary,
  setAgentAnalysis,
  setAgentAnalysisMany,
};
