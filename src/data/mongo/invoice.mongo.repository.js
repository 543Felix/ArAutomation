const Invoice = require('../../modules/invoice/invoice.model');
const { buildInvoiceMatchQuery } = require('../../modules/ar/ar.matcher');

async function findMatchingInvoice({ invoiceNo, merchantId, outletId, invoiceDate, proximityDays }) {
  const query = buildInvoiceMatchQuery({
    invoiceNo,
    merchantId,
    outletId,
    invoiceDate,
    proximityDays,
  });
  return Invoice.findOne(query).lean();
}

async function findByIdLean(id) {
  return Invoice.findById(id).lean();
}

/** Upsert one invoice document from an Ecobillz `/invoices` or related payload (`no`, `date`, `total`, …). */
async function upsertFromEcobillz(doc, merchantId, outletId) {
  const invoiceNo = doc.no ?? doc.taxInvoiceNo ?? doc.invoiceNo;
  if (!invoiceNo) return null;

  const pdfUrlRaw = doc.pdfUrl != null ? String(doc.pdfUrl).trim() : '';

  const patch = {
    merchantId,
    outletId,
    invoiceNo: String(invoiceNo),
    ...(doc.date ? { invoiceDate: new Date(doc.date) } : {}),
    amount: Number(doc.total) || 0,
    ...(doc.pdfDocId ? { pdfDocId: String(doc.pdfDocId) } : {}),
    ...(pdfUrlRaw ? { pdfUrl: pdfUrlRaw } : {}),
  };

  return Invoice.findOneAndUpdate(
    { merchantId, outletId, invoiceNo: patch.invoiceNo },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

module.exports = {
  findMatchingInvoice,
  findByIdLean,
  upsertFromEcobillz,
};
