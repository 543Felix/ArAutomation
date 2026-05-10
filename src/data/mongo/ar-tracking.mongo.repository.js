const ArTracking = require('../../modules/ar/ar-tracking.model');
const { toObjectId } = require('./object-id.util');

async function findByArEntryId(arEntryId) {
  const oid = toObjectId(arEntryId);
  if (!oid) return null;
  return ArTracking.findOne({ arEntryId: oid }).lean();
}

/** Upsert an empty tracking row (no timeline events yet). */
async function ensureDocument(arEntryId, invoiceNo) {
  const oid = toObjectId(arEntryId);
  if (!oid) return null;
  await ArTracking.updateOne(
    { arEntryId: oid },
    {
      $setOnInsert: { timeline: [] },
      $set: { invoiceNo: String(invoiceNo || '') },
    },
    { upsert: true },
  );
  return ArTracking.findOne({ arEntryId: oid }).lean();
}

/**
 * Append one immutable timeline event (never replaces history).
 */
async function findByArEntryIds(arEntryIds) {
  const oids = [...new Set((arEntryIds || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!oids.length) return [];
  return ArTracking.find({ arEntryId: { $in: oids } }).lean();
}

async function appendEvent(arEntryId, invoiceNo, event) {
  const oid = toObjectId(arEntryId);
  if (!oid) return null;

  const doc = await ArTracking.findOneAndUpdate(
    { arEntryId: oid },
    {
      $set: { invoiceNo: String(invoiceNo || '') },
      $push: { timeline: event },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

module.exports = {
  findByArEntryId,
  findByArEntryIds,
  ensureDocument,
  appendEvent,
};
