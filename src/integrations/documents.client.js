const { requestJson, requestArrayBuffer } = require('../utils/http-client');

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, String(v));
  });
  return url.toString();
}

/**
 * Optional fallback: resolve a docId → s3Url via DOCUMENTS_API_URL when the
 * local pdfDocuments collection does not have the doc.
 */
async function fetchDocumentMeta(docId) {
  const base = process.env.DOCUMENTS_API_URL;
  if (!base) return null;
  const url = buildUrl(base, { docId });
  const body = await requestJson(url, { method: 'GET' });
  if (!body) return null;
  const s3Url = body.s3Url || body.url || body?.data?.s3Url;
  return s3Url ? { docId, s3Url } : null;
}

async function downloadPdfBytes(s3Url) {
  return requestArrayBuffer(s3Url, { method: 'GET' });
}

module.exports = {
  fetchDocumentMeta,
  downloadPdfBytes,
};
