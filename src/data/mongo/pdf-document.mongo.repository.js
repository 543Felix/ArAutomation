const PdfDocument = require('../../modules/document/pdf-document.model');

async function findOneByDocIdLean(docId) {
  if (!docId) return null;
  return PdfDocument.findOne({ docId }).lean();
}

async function upsertByDocId(payload) {
  const { docId, ...rest } = payload;
  await PdfDocument.updateOne({ docId }, { $set: { docId, ...rest } }, { upsert: true });
}

module.exports = {
  findOneByDocIdLean,
  upsertByDocId,
};
