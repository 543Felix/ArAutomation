const documentsClient = require('../../integrations/documents.client');
const logger = require('../../utils/logger');
const { pdfDocumentRepository } = require('../../data/repositories');

async function findS3UrlByDocId(docId) {
  if (!docId) return null;
  const local = await pdfDocumentRepository.findOneByDocIdLean(docId);
  if (local?.s3Url) return local.s3Url;

  try {
    const remote = await documentsClient.fetchDocumentMeta(docId);
    if (remote?.s3Url) {
      logger.info('PDF document resolved via remote API', { docId });
      return remote.s3Url;
    }
  } catch (err) {
    logger.warn('PDF document remote fallback failed', { docId, message: err.message });
  }

  return null;
}

async function registerMetadata(payload) {
  if (!payload?.docId || !payload?.s3Url) {
    return { saved: false, reason: 'docId and s3Url are required' };
  }
  await pdfDocumentRepository.upsertByDocId(payload);
  return { saved: true, docId: payload.docId };
}

module.exports = {
  findS3UrlByDocId,
  registerMetadata,
};
