const EmailThread = require('../../modules/email/email.model');
const { toObjectId } = require('./object-id.util');

async function findByArEntryId(arEntryId) {
  const oid = toObjectId(arEntryId);
  if (!oid) return null;
  return EmailThread.findOne({ arEntryId: oid }).lean();
}

async function findByArEntryIds(arEntryIds) {
  const oids = [...new Set((arEntryIds || []).map((id) => toObjectId(id)).filter(Boolean))];
  if (!oids.length) return [];
  return EmailThread.find({ arEntryId: { $in: oids } }).lean();
}

async function upsertEmptyThread({ arEntryId, invoiceNo, threadId }) {
  const oid = toObjectId(arEntryId);
  if (!oid) return null;

  const doc = await EmailThread.findOneAndUpdate(
    { arEntryId: oid },
    {
      $setOnInsert: {
        threadId: String(threadId),
        invoiceNo: String(invoiceNo || ''),
        messages: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

/**
 * Appends one message if no existing message has the same messageId (atomic filter).
 * @returns {{ modifiedCount: number }}
 */
async function appendMessageIfNew(arEntryId, messageDoc) {
  const oid = toObjectId(arEntryId);
  if (!oid) return { modifiedCount: 0 };

  const mid = String(messageDoc.messageId || '').trim();

  const result = await EmailThread.updateOne(
    {
      arEntryId: oid,
      $nor: [{ messages: { $elemMatch: { messageId: mid } } }],
    },
    {
      $push: { messages: messageDoc },
      $set: { updatedAt: new Date() },
    },
  );

  return { modifiedCount: result.modifiedCount ?? result.nModified ?? 0 };
}

module.exports = {
  findByArEntryId,
  findByArEntryIds,
  upsertEmptyThread,
  appendMessageIfNew,
};
