const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const documentService = require('./document.service');
const documentsClient = require('../../integrations/documents.client');
const invoiceService = require('../invoice/invoice.service');
const checkService = require('../check/check.service');
const { arEntryRepository } = require('../../data/repositories');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { AR_STATUS } = require('../ar/ar.constants');
const { FILES_PUBLIC_PREFIX } = require('../../config/api-constants');
const aiService = require('../ai/ai.service');
const { companyPdfBundleKey } = require('../ar/ar-bundle-key.util');
const {
  buildCoverLetterGroupPayload,
  buildCoverLetterJobPayload,
} = require('./cover-letter.payload');
const trackingService = require('../tracking/tracking.service');

async function safeTracking(tag, fn) {
  try {
    await fn();
  } catch (err) {
    logger.warn(`[pdf][tracking] ${tag}`, { error: logger.serializeError(err) });
  }
}

function getStorageDir() {
  return process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage');
}

function getPublicBaseUrl() {
  return process.env.PUBLIC_BASE_URL || '';
}

async function buildCoverLetter({ entry, invoice, checks }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const draw = (text, x, y, size = 11, useFont = font) => {
    page.drawText(String(text), { x, y, size, font: useFont });
  };

  let y = 800;
  draw('Accounts Receivable Cover Letter', 50, y, 18, bold);
  y -= 30;

  const lines = [
    `AR Entry ID: ${entry._id}`,
    `Invoice No: ${entry.invoiceNo}`,
    `Invoice Date: ${entry.invoiceDate ? new Date(entry.invoiceDate).toISOString().slice(0, 10) : '-'}`,
    `Amount: ${entry.amount}`,
    `Merchant: ${entry.merchantId}`,
    `Outlet: ${entry.outletId}`,
    `Confidence Score: ${entry.confidenceScore?.toFixed?.(3) ?? entry.confidenceScore}`,
    `Checks Matched: ${entry.matchedChecks} / ${entry.expectedChecks}`,
    `Missing Checks: ${entry.missingChecks}`,
    `Status: ${entry.status}`,
  ];

  for (const line of lines) {
    draw(line, 50, y);
    y -= 16;
  }

  y -= 10;
  draw('Linked Documents', 50, y, 13, bold);
  y -= 18;
  draw(
    `Invoice PDF: ${invoice?.pdfUrl || invoice?.pdfDocId || 'n/a'}`,
    50,
    y,
  );
  y -= 14;
  draw(`Checks: ${(checks || []).map((c) => c.checkNo).join(', ') || 'n/a'}`, 50, y);

  return Buffer.from(await pdf.save());
}

/**
 * Renders a plain-text cover letter (e.g. AI service output) to a single-column
 * A4 PDF with simple word-wrap and pagination.
 */
async function renderCoverLetterPdfFromText(text) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const pageSize = [595, 842];
  const margin = 50;
  const fontSize = 11;
  const lineHeight = fontSize * 1.4;
  const maxWidth = pageSize[0] - margin * 2;

  const wrapLine = (line) => {
    if (!line) return [''];
    const words = line.split(/\s+/);
    const out = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
    return out.length ? out : [''];
  };

  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap(wrapLine);

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: fontSize, font });
    }
    y -= lineHeight;
  }

  return Buffer.from(await pdf.save());
}

async function mergePdfs(pdfBuffers) {
  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    if (!buf || !buf.length) continue;
    let src;
    try {
      src = await PDFDocument.load(buf, { ignoreEncryption: true });
    } catch (err) {
      logger.warn('Skipping unreadable PDF source', { message: err.message });
      continue;
    }
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

async function fetchPdfByDocId(docId) {
  const s3Url = await documentService.findS3UrlByDocId(docId);
  if (!s3Url) {
    logger.warn('No s3Url for docId', { docId });
    return null;
  }
  try {
    return await documentsClient.downloadPdfBytes(s3Url);
  } catch (err) {
    logger.warn('PDF download failed', { docId, message: err.message });
    return null;
  }
}

/**
 * Prefer Ecobillz `pdfUrl` (HTTP(S) or local path), then document-store `pdfDocId`.
 */
async function fetchInvoicePdfBuffer(invoice) {
  if (!invoice) return null;

  const raw = invoice.pdfUrl != null ? String(invoice.pdfUrl).trim() : '';
  if (raw) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        return await documentsClient.downloadPdfBytes(raw);
      } catch (err) {
        logger.warn('Invoice pdfUrl HTTP fetch failed', { message: err.message });
      }
    } else {
      try {
        const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
        return await fs.readFile(filePath);
      } catch (err) {
        logger.warn('Invoice pdfUrl file read failed', { path: raw, message: err.message });
      }
    }
  }

  if (invoice.pdfDocId) {
    return fetchPdfByDocId(invoice.pdfDocId);
  }
  return null;
}

async function saveMergedPdf(arEntryId, bytes, options = {}) {
  const dir = path.join(getStorageDir(), 'ar-pdfs');
  await fs.mkdir(dir, { recursive: true });
  const n = options.bundleInvoiceCount;
  const stem =
    typeof n === 'number' && n > 1
      ? `company-${String(arEntryId)}-${n}inv`
      : String(arEntryId);
  const filename = `ar-${stem}-${Date.now()}.pdf`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, bytes);
  const relativeUrl = `${FILES_PUBLIC_PREFIX}/ar-pdfs/${filename}`;
  const base = getPublicBaseUrl();
  return base ? `${base.replace(/\/$/, '')}${relativeUrl}` : relativeUrl;
}

function normalizeArEntryIds(arEntryIdOrIds) {
  if (Array.isArray(arEntryIdOrIds)) {
    return [...new Set(arEntryIdOrIds.map(String).filter(Boolean))];
  }
  if (arEntryIdOrIds != null && String(arEntryIdOrIds).trim()) {
    return [String(arEntryIdOrIds).trim()];
  }
  return [];
}

function sortEntriesForBundle(entries) {
  return [...entries].sort((a, b) => {
    const na = String(a.invoiceNo ?? '');
    const nb = String(b.invoiceNo ?? '');
    const c = na.localeCompare(nb, undefined, { numeric: true });
    if (c !== 0) return c;
    return String(a._id).localeCompare(String(b._id));
  });
}

/**
 * Builds one cover letter for the company group, then appends each AR row's
 * invoice PDF and linked cheque PDFs in invoice order.
 */
async function generateAndAttachPdf(arEntryIdOrIds) {
  const ids = normalizeArEntryIds(arEntryIdOrIds);
  if (!ids.length) {
    throw new AppError('At least one arEntryId is required for PDF generation', 400);
  }

  const found = await arEntryRepository.findByIds(ids);
  if (found.length !== ids.length) {
    throw new AppError('One or more AR entries were not found', 404);
  }

  const eligible = found.filter(
    (e) => e.status === AR_STATUS.READY_FOR_PDF || e.status === AR_STATUS.PDF_GENERATED,
  );
  if (eligible.length !== found.length) {
    throw new AppError(
      'All AR entries must be READY_FOR_PDF or PDF_GENERATED to build merged PDF',
      409,
    );
  }

  const bundleKey = companyPdfBundleKey(eligible[0]);
  for (const e of eligible) {
    if (companyPdfBundleKey(e) !== bundleKey) {
      throw new AppError(
        'All AR entries in one PDF job must share merchant, outlet, and billing identifier (or company name)',
        422,
      );
    }
  }

  const sortedEntries = sortEntriesForBundle(eligible);
  const rows = [];
  for (const entry of sortedEntries) {
    const invoice = entry.invoiceRefId
      ? await invoiceService.findByIdLean(entry.invoiceRefId)
      : null;
    const checks = await checkService.findChecksForInvoice({
      invoiceNo: entry.invoiceNo,
      merchantId: entry.merchantId,
      outletId: entry.outletId,
    });
    rows.push({ entry, invoice, checks });
  }

  const coverLetterData = buildCoverLetterGroupPayload(rows);
  const { buffer: cover } = await buildAiCoverLetter(coverLetterData);

  await safeTracking('cover_letter', () =>
    trackingService.recordCoverLetterForEntries(sortedEntries),
  );

  const bodyBuffers = [];
  for (const { invoice, checks } of rows) {
    const invoicePdf = await fetchInvoicePdfBuffer(invoice);
    if (invoicePdf) bodyBuffers.push(invoicePdf);
    for (const c of checks) {
      if (!c.pdfDocId) continue;
      const buf = await fetchPdfByDocId(c.pdfDocId);
      if (buf) bodyBuffers.push(buf);
    }
  }

  const merged = await mergePdfs([cover, ...bodyBuffers]);
  const primaryId = String(sortedEntries[0]._id);
  const bundleInvoiceCount = sortedEntries.length;
  const finalPdfUrl = await saveMergedPdf(primaryId, merged, {
    bundleInvoiceCount,
  });

  const entryObjectIds = sortedEntries.map((e) => e._id);
  await arEntryRepository.markPdfGeneratedMany(entryObjectIds, finalPdfUrl);

  await safeTracking('pdf_generated', () =>
    trackingService.recordPdfGeneratedForEntries(sortedEntries, finalPdfUrl),
  );

  try {
    const { scheduleSendEmailAfterPdf } = require('../jobs/email.job');
    await scheduleSendEmailAfterPdf(sortedEntries, finalPdfUrl);
  } catch (err) {
    logger.warn('[pdf] enqueue outbound email failed', { error: logger.serializeError(err) });
  }

  return {
    arEntryIds: sortedEntries.map((e) => String(e._id)),
    finalPdfUrl,
  };
}

async function renderPlaceholder(payload) {
  logger.info('PDF render placeholder', {
    keys: payload ? Object.keys(payload) : [],
  });
  return { format: 'pdf', stub: true };
}

/**
 * Build the cover-letter PDF from an AI-refined (or template-rendered) text body.
 * Falls back to the deterministic template if AI is disabled or fails — see
 * `ai.service.generateCoverLetter`.
 */
async function buildAiCoverLetter(coverLetterData) {
  logger.info('[cover-letter] pdf.wrap — generating text', {
    stage: 'pdf.before_ai',
    payloadKeys: coverLetterData ? Object.keys(coverLetterData) : [],
  });

  const { coverLetterText, source, missingPlaceholders } =
    await aiService.generateCoverLetter(coverLetterData);

  logger.info('[cover-letter] pdf.wrap — text ready', {
    stage: 'pdf.after_ai',
    source,
    coverLetterCharCount: coverLetterText.length,
    missingPlaceholderCount: missingPlaceholders.length,
  });

  const buffer = await renderCoverLetterPdfFromText(coverLetterText);

  logger.info('[cover-letter] pdf.wrap — PDF bytes built', {
    stage: 'pdf.after_render',
    pdfByteLength: buffer.length,
    source,
  });

  return { buffer, coverLetterText, source };
}

module.exports = {
  generateAndAttachPdf,
  normalizeArEntryIds,
  buildCoverLetter,
  buildCoverLetterJobPayload,
  buildAiCoverLetter,
  renderCoverLetterPdfFromText,
  mergePdfs,
  saveMergedPdf,
  renderPlaceholder,
  getStorageDir,
};
