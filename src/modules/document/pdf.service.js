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
  draw(`Invoice document: ${invoice?.pdfDocId || 'n/a'}`, 50, y);
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

async function saveMergedPdf(arEntryId, bytes) {
  const dir = path.join(getStorageDir(), 'ar-pdfs');
  await fs.mkdir(dir, { recursive: true });
  const filename = `ar-${arEntryId}-${Date.now()}.pdf`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, bytes);
  const relativeUrl = `${FILES_PUBLIC_PREFIX}/ar-pdfs/${filename}`;
  const base = getPublicBaseUrl();
  return base ? `${base.replace(/\/$/, '')}${relativeUrl}` : relativeUrl;
}

/**
 * Full PDF creation pipeline for a given AR entry.
 * Loads invoice + checks, fetches their s3 PDFs, builds a cover letter,
 * merges them, persists the file, and updates the AR entry status.
 */
async function generateAndAttachPdf(arEntryId) {
  const entry = await arEntryRepository.findById(arEntryId);
  if (!entry) {
    throw new AppError(`AR entry ${arEntryId} not found`, 404);
  }
  if (entry.status !== AR_STATUS.READY_FOR_PDF && entry.status !== AR_STATUS.PDF_GENERATED) {
    throw new AppError(`AR entry status=${entry.status} not eligible for PDF generation`, 409);
  }

  const invoice = entry.invoiceRefId
    ? await invoiceService.findByIdLean(entry.invoiceRefId)
    : null;
  const checks = await checkService.findChecksForInvoice({
    invoiceNo: entry.invoiceNo,
    merchantId: entry.merchantId,
    outletId: entry.outletId,
  });

  const cover = await buildCoverLetter({ entry, invoice, checks });

  const invoicePdf = invoice?.pdfDocId ? await fetchPdfByDocId(invoice.pdfDocId) : null;
  const checkPdfs = [];
  for (const c of checks) {
    if (!c.pdfDocId) continue;
    const buf = await fetchPdfByDocId(c.pdfDocId);
    if (buf) checkPdfs.push(buf);
  }

  const merged = await mergePdfs([cover, invoicePdf, ...checkPdfs].filter(Boolean));
  const finalPdfUrl = await saveMergedPdf(String(entry._id), merged);

  await arEntryRepository.markPdfGenerated(entry._id, finalPdfUrl);

  return { arEntryId: String(entry._id), finalPdfUrl };
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
  const { coverLetterText, source, missingPlaceholders } =
    await aiService.generateCoverLetter(coverLetterData);
  logger.info('Cover letter generated', {
    source,
    chars: coverLetterText.length,
    missingPlaceholderCount: missingPlaceholders.length,
  });
  const buffer = await renderCoverLetterPdfFromText(coverLetterText);
  return { buffer, coverLetterText, source };
}

module.exports = {
  generateAndAttachPdf,
  buildCoverLetter,
  buildAiCoverLetter,
  renderCoverLetterPdfFromText,
  mergePdfs,
  saveMergedPdf,
  renderPlaceholder,
  getStorageDir,
};
