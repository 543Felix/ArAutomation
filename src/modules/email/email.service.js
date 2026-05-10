const path = require('path');
const fs = require('fs/promises');

const logger = require('../../utils/logger');
const mailer = require('../../config/mailer');
const { FILES_PUBLIC_PREFIX } = require('../../config/api-constants');
const { requestArrayBuffer } = require('../../utils/http-client');
const aiService = require('../ai/ai.service');
const trackingService = require('../tracking/tracking.service');
const { arEntryRepository, emailThreadRepository } = require('../../data/repositories');
const { toObjectId } = require('../../data/mongo/object-id.util');
const EmailThreadModel = require('./email.model');
const { AR_STATUS } = require('../ar/ar.constants');
const AppError = require('../../utils/app-error');

class FatalEmailJobError extends Error {
  constructor(message, code = 'EMAIL_JOB_FATAL') {
    super(message);
    this.code = code;
    this.name = 'FatalEmailJobError';
  }
}

function normalizeIds(payload) {
  const ids =
    Array.isArray(payload.arEntryIds) && payload.arEntryIds.length > 0
      ? payload.arEntryIds
      : payload.arId
        ? [payload.arId]
        : [];
  return [...new Set(ids.map(String).filter(Boolean))];
}

async function resolvePdfBytesFromFinalUrl(finalPdfUrl) {
  const raw = String(finalPdfUrl || '').trim();
  if (!raw) throw new FatalEmailJobError('finalPdfUrl is empty', 'EMAIL_FATAL_BAD_PAYLOAD');

  if (/^https?:\/\//i.test(raw)) {
    return requestArrayBuffer(raw);
  }

  const prefix = FILES_PUBLIC_PREFIX || '/api/files';
  if (raw.startsWith(prefix)) {
    const storageDir = process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage');
    const relativeFromPrefix = raw.slice(prefix.length).replace(/^\//, '');
    const filePath = path.join(storageDir, relativeFromPrefix);
    return fs.readFile(filePath);
  }

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    throw new FatalEmailJobError(
      'PUBLIC_BASE_URL or absolute PDF URL required to fetch attachment',
      'EMAIL_FATAL_PDF_FETCH',
    );
  }
  const pathPart = raw.startsWith('/') ? raw : `/${raw}`;
  return requestArrayBuffer(`${base}${pathPart}`);
}

/**
 * Processor entrypoint — validates DB state, generates AI email (fallback on failure),
 * sends via SMTP with PDF attachment, marks entries EMAIL_SENT.
 *
 * @param {{
 *   arId: string,
 *   arEntryIds?: string[],
 *   invoiceNo: string,
 *   invoiceNos?: string[],
 *   customerEmail: string,
 *   customerName?: string,
 *   amount?: number|string,
 *   dueDate?: string,
 *   finalPdfUrl: string,
 *   missingDocuments?: string[],
 * }} payload
 */
async function sendInvoiceEmail(payload = {}) {
  if (!mailer.isConfigured()) {
    throw new FatalEmailJobError('SMTP not configured (SMTP_HOST / EMAIL_FROM)', 'EMAIL_FATAL_NO_SMTP');
  }

  const toRaw = String(payload.customerEmail || '').trim();
  if (!toRaw) {
    throw new FatalEmailJobError('customerEmail is required', 'EMAIL_FATAL_NO_TO');
  }

  const ids = normalizeIds(payload);
  if (!ids.length) {
    throw new FatalEmailJobError('Job payload missing arId / arEntryIds', 'EMAIL_FATAL_BAD_PAYLOAD');
  }

  const entries = await arEntryRepository.findByIds(ids);
  if (entries.length !== ids.length) {
    throw new FatalEmailJobError('One or more AR entries not found', 'EMAIL_FATAL_NOT_FOUND');
  }

  const finalPdfUrl = String(payload.finalPdfUrl || entries[0].finalPdfUrl || '').trim();
  if (!finalPdfUrl) {
    throw new FatalEmailJobError('No finalPdfUrl on job or AR entry', 'EMAIL_FATAL_NO_PDF');
  }

  if (entries.every((e) => e.status === AR_STATUS.EMAIL_SENT)) {
    logger.info('[email-job] skip — already EMAIL_SENT', { ids });
    return { skipped: true, reason: 'already_sent' };
  }

  if (entries.some((e) => e.status !== AR_STATUS.PDF_GENERATED)) {
    throw new FatalEmailJobError(
      'All targeted entries must be PDF_GENERATED before email send',
      'EMAIL_FATAL_BAD_STATUS',
    );
  }

  if (entries.some((e) => String(e.finalPdfUrl || '').trim() !== finalPdfUrl)) {
    throw new FatalEmailJobError(
      'finalPdfUrl mismatch across bundled entries',
      'EMAIL_FATAL_PDF_MISMATCH',
    );
  }

  const companyName =
    (payload.companyName != null && String(payload.companyName).trim()) ||
    (payload.customerName != null && String(payload.customerName).trim()) ||
    '';
  const businessDate =
    payload.businessDate != null && String(payload.businessDate).trim()
      ? String(payload.businessDate).trim()
      : '';

  const aiInput = {
    invoiceNo: payload.invoiceNo,
    amount: payload.amount ?? entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    dueDate: payload.dueDate || '',
    companyName,
    businessDate,
    customerName: companyName,
    missingDocuments: Array.isArray(payload.missingDocuments) ? payload.missingDocuments : [],
  };

  const gen = await aiService.generateCollectionEmail(aiInput);
  const { subject, body, source } = gen;

  let pdfBuffer;
  try {
    pdfBuffer = await resolvePdfBytesFromFinalUrl(finalPdfUrl);
  } catch (err) {
    logger.error('[email-job] PDF fetch failed', { error: logger.serializeError(err) });
    throw new FatalEmailJobError(`Could not load PDF attachment: ${err.message}`, 'EMAIL_FATAL_PDF_FETCH');
  }

  let mailInfo;
  try {
    mailInfo = await mailer.sendMail({
      to: toRaw,
      subject,
      text: body,
      attachments: [{ filename: 'invoice.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    logger.error('[email-job] SMTP send failed', { error: logger.serializeError(err) });
    throw err;
  }

  try {
    await trackingService.recordEmailSentAndDelivered(entries, {
      to: toRaw,
      subject,
      messageId: mailInfo?.messageId,
      accepted: mailInfo?.accepted,
      rejected: mailInfo?.rejected,
    });
  } catch (err) {
    logger.warn('[email-job] tracking timeline append failed', {
      error: logger.serializeError(err),
    });
  }

  const objectIds = entries.map((e) => e._id);
  await arEntryRepository.markEmailSentMany(objectIds, {
    subject,
    body,
    message: `Email delivered (${source}) to ${toRaw}`,
  });

  logger.info('[email-job] completed', {
    arEntryIds: ids,
    source,
    subjectPreview: subject.slice(0, 80),
  });

  return {
    sent: true,
    arEntryIds: ids,
    source,
  };
}

async function enqueueManualSendForArEntry(arEntryId, overrides = {}) {
  const entry = await arEntryRepository.findById(arEntryId);
  if (!entry) {
    throw new AppError('AR entry not found', 404);
  }
  if (!entry.finalPdfUrl) {
    throw new AppError('AR entry has no finalPdfUrl — generate PDF first', 409);
  }

  const siblings = await arEntryRepository.findByFinalPdfUrl(entry.finalPdfUrl);
  const targets = siblings.filter((e) => e.status === AR_STATUS.PDF_GENERATED);
  if (!targets.length) {
    throw new AppError('No PDF_GENERATED rows found for this attachment', 409);
  }

  const emailJob = require('../jobs/email.job');
  const payload = await emailJob.buildEmailJobPayloadFromEntries(targets, entry.finalPdfUrl);
  const overrideTo = overrides.customerEmail || overrides.to;
  if (overrideTo) {
    payload.customerEmail = String(overrideTo).trim();
  }
  if (!payload.customerEmail) {
    throw new AppError(
      'Recipient missing — create a Company with matching name (AR companyName / billingIdentifier), or set customer.email, or AR_COLLECTION_EMAIL_DEFAULT_TO',
      422,
    );
  }

  const jobId = await emailJob.scheduleSendEmailJob(payload);
  return { queued: true, jobId, payloadSummary: { arEntryIds: payload.arEntryIds } };
}

/** Stub retained for backward compatibility — prefer queue-driven sending */
async function queueOutbound(payload) {
  logger.info('queueOutbound called — use POST /api/v1/email/send/:arId instead', {
    keys: payload ? Object.keys(payload) : [],
  });
  return { queued: false, stub: true };
}

function sortThreadMessagesAsc(messages) {
  return [...(messages || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function shapeThreadMessageForApi(m) {
  return {
    messageId: m.messageId,
    direction: m.direction,
    from: m.from,
    to: m.to,
    subject: m.subject,
    body: m.body,
    timestamp: m.timestamp,
    ...(m.aiAnalysis ? { aiAnalysis: m.aiAnalysis } : {}),
    ...(m.metadata ? { metadata: m.metadata } : {}),
  };
}

function shapeThreadMessageForThreadView(m) {
  return {
    direction: m.direction,
    from: m.from,
    subject: m.subject,
    body: m.body,
    timestamp: m.timestamp,
    ...(m.aiAnalysis ? { aiAnalysis: m.aiAnalysis } : {}),
  };
}

async function createThreadIfNotExists(arId, invoiceNo) {
  const oid = toObjectId(arId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const entry = await arEntryRepository.findById(oid);
  if (!entry) throw new AppError('AR entry not found', 404);

  const inv =
    invoiceNo != null && String(invoiceNo).trim()
      ? String(invoiceNo).trim()
      : String(entry.invoiceNo || '').trim();

  await emailThreadRepository.upsertEmptyThread({
    arEntryId: oid,
    invoiceNo: inv,
    threadId: String(oid),
  });
}

async function addEmailMessage(data = {}) {
  const dirs = EmailThreadModel.EMAIL_DIRECTION;
  const direction = data.direction;
  if (!direction || !Object.values(dirs).includes(direction)) {
    throw new AppError('direction must be OUTBOUND or INBOUND', 422);
  }

  const messageId = String(data.messageId || '').trim();
  if (!messageId) throw new AppError('messageId is required', 422);

  await createThreadIfNotExists(data.arId, data.invoiceNo);

  const oid = toObjectId(data.arId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const msgDoc = {
    messageId,
    direction,
    from: String(data.from ?? '').trim(),
    to: String(data.to ?? '').trim(),
    subject: data.subject != null ? String(data.subject) : '',
    body: data.body != null ? String(data.body) : '',
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    ...(data.aiAnalysis && typeof data.aiAnalysis === 'object'
      ? { aiAnalysis: data.aiAnalysis }
      : {}),
    ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
  };

  if (!msgDoc.from || !msgDoc.to) {
    throw new AppError('from and to are required', 422);
  }

  const { modifiedCount } = await emailThreadRepository.appendMessageIfNew(oid, msgDoc);
  const thread = await emailThreadRepository.findByArEntryId(oid);

  if (modifiedCount === 0) {
    const dup = thread?.messages?.some((m) => String(m.messageId) === messageId);
    if (dup) {
      return {
        duplicate: true,
        thread: thread
          ? {
              arId: String(thread.arEntryId),
              invoiceNo: thread.invoiceNo,
              threadId: thread.threadId,
              messages: sortThreadMessagesAsc(thread.messages).map(shapeThreadMessageForApi),
            }
          : null,
      };
    }
    throw new AppError('Unable to append email message', 409);
  }

  return {
    duplicate: false,
    thread: {
      arId: String(thread.arEntryId),
      invoiceNo: thread.invoiceNo,
      threadId: thread.threadId,
      messages: sortThreadMessagesAsc(thread.messages).map(shapeThreadMessageForApi),
    },
  };
}

async function getEmailThread(arId) {
  const oid = toObjectId(arId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const doc = await emailThreadRepository.findByArEntryId(oid);
  if (!doc) {
    const entry = await arEntryRepository.findById(oid);
    return {
      arId: String(oid),
      invoiceNo: entry ? String(entry.invoiceNo || '') : '',
      messages: [],
    };
  }

  return {
    arId: String(doc.arEntryId),
    invoiceNo: doc.invoiceNo,
    messages: sortThreadMessagesAsc(doc.messages).map(shapeThreadMessageForThreadView),
  };
}

module.exports = {
  FatalEmailJobError,
  sendInvoiceEmail,
  enqueueManualSendForArEntry,
  queueOutbound,
  createThreadIfNotExists,
  addEmailMessage,
  getEmailThread,
};
