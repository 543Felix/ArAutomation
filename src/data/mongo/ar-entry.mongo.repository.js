const ArEntry = require('../../modules/ar/ar-entry.model');
const { AR_STATUS, AR_LOG_LEVEL } = require('../../modules/ar/ar.constants');
const { toObjectId } = require('./object-id.util');

async function pushLog(arEntryId, logDoc) {
  await ArEntry.updateOne({ _id: arEntryId }, { $push: { logs: logDoc } });
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

  const chequeDetails = Array.isArray(record.chequeDetails) ? record.chequeDetails : [];

  const update = {
    $setOnInsert: {
      arId: record.arId,
      invoiceNo: record.invoiceNo,
      invoiceDate: record.invoiceDate ? new Date(record.invoiceDate) : undefined,
      merchantId,
      outletId,
      amount: Number(record.amount) || 0,
      ...(record.arrivalDate ? { arrivalDate: new Date(record.arrivalDate) } : {}),
      ...(record.departureDate ? { departureDate: new Date(record.departureDate) } : {}),
      ...(record.businessDate ? { businessDate: new Date(record.businessDate) } : {}),
      ...(chequeDetails.length ? { chequeDetails } : {}),
      status: AR_STATUS.PENDING,
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

async function markEmailSent(entryId) {
  await ArEntry.updateOne(
    { _id: entryId },
    {
      $set: { status: AR_STATUS.EMAIL_SENT },
      $push: {
        logs: {
          step: 'email.send',
          level: AR_LOG_LEVEL.INFO,
          message: 'Email queued',
          at: new Date(),
        },
      },
    },
  );
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

module.exports = {
  pushLog,
  upsertPendingFromRaw,
  findById,
  setInvoiceNotFound,
  setInvoiceMatched,
  applyScoringUpdate,
  findPage,
  count,
  markEmailSent,
  markPdfGenerated,
};
