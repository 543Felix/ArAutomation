const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { arEntryRepository, arTrackingRepository } = require('../../data/repositories');
const { toObjectId } = require('../../data/mongo/object-id.util');
const {
  TRACKING_EVENT_STATUS,
  TRACKING_UI_STEP_ORDER,
  TRACKING_DEFAULT_LABELS,
} = require('../ar/ar-tracking.constants');

const RESPONSE_EVENTS_AFTER_EMAIL = new Set([
  TRACKING_EVENT_STATUS.CLIENT_RESPONDED,
  TRACKING_EVENT_STATUS.RECEIVED_BY_CLIENT,
  TRACKING_EVENT_STATUS.PAYMENT_INITIATED,
  TRACKING_EVENT_STATUS.PARTIAL_PAYMENT,
  TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED,
]);

const FALLBACK_DESCRIPTIONS = Object.freeze({
  [TRACKING_EVENT_STATUS.COVER_LETTER_GENERATED]:
    'The accounts-receivable cover letter was generated for this invoice.',
  [TRACKING_EVENT_STATUS.PDF_GENERATED]:
    'The consolidated PDF was produced and attached to this AR entry.',
  [TRACKING_EVENT_STATUS.EMAIL_SENT]: 'The collection email was sent to the company.',
  [TRACKING_EVENT_STATUS.EMAIL_DELIVERED]: 'The message was accepted by the outbound mail server.',
  [TRACKING_EVENT_STATUS.EMAIL_OPENED]: 'The recipient opened the email (tracked externally).',
  [TRACKING_EVENT_STATUS.RECEIVED_BY_CLIENT]: 'The client confirmed receipt of the documents.',
  [TRACKING_EVENT_STATUS.CLIENT_RESPONDED]: 'The customer replied regarding this invoice.',
  [TRACKING_EVENT_STATUS.PAYMENT_INITIATED]: 'Payment was initiated toward this balance.',
  [TRACKING_EVENT_STATUS.PARTIAL_PAYMENT]: 'A partial payment was recorded.',
  [TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED]: 'Full payment was completed.',
  [TRACKING_EVENT_STATUS.ESCALATION_TRIGGERED]:
    'This invoice was escalated due to SLA / lack of response.',
});

function resolveDescription(status, label, explicitDescription) {
  if (explicitDescription && String(explicitDescription).trim()) {
    return String(explicitDescription).trim();
  }
  return FALLBACK_DESCRIPTIONS[status] || `${label}.`;
}

function sortTimeline(timeline) {
  return [...(timeline || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function buildStepperSteps(sortedTimeline) {
  const completed = new Set(sortedTimeline.map((e) => e.status));
  let placedCurrent = false;
  return TRACKING_UI_STEP_ORDER.map((status, idx) => {
    let state = 'pending';
    if (completed.has(status)) state = 'completed';
    else if (!placedCurrent) {
      const priorDone = TRACKING_UI_STEP_ORDER.slice(0, idx).every((s) => completed.has(s));
      if (priorDone) {
        state = 'current';
        placedCurrent = true;
      }
    }
    return {
      status,
      label: TRACKING_DEFAULT_LABELS[status] || status,
      state,
    };
  });
}

function computeSlaMetrics(sortedTimeline) {
  let emailSentAt = null;
  let clientRespondedAt = null;
  let paymentAt = null;

  for (const e of sortedTimeline) {
    if (e.status === TRACKING_EVENT_STATUS.EMAIL_SENT && !emailSentAt) {
      emailSentAt = new Date(e.timestamp);
    }
    if (
      (e.status === TRACKING_EVENT_STATUS.CLIENT_RESPONDED ||
        e.status === TRACKING_EVENT_STATUS.RECEIVED_BY_CLIENT) &&
      !clientRespondedAt
    ) {
      clientRespondedAt = new Date(e.timestamp);
    }
    if (
      (e.status === TRACKING_EVENT_STATUS.PAYMENT_INITIATED ||
        e.status === TRACKING_EVENT_STATUS.PARTIAL_PAYMENT ||
        e.status === TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED) &&
      !paymentAt
    ) {
      paymentAt = new Date(e.timestamp);
    }
  }

  const hoursBetween = (a, b) =>
    a && b ? Math.round(((b.getTime() - a.getTime()) / 36e5) * 10) / 10 : null;

  return {
    emailSentAt,
    clientRespondedAt,
    firstPaymentRelatedAt: paymentAt,
    hoursEmailSentToResponse: hoursBetween(emailSentAt, clientRespondedAt),
    hoursResponseToPayment: hoursBetween(clientRespondedAt, paymentAt),
  };
}

function notifyPaymentIfNeeded(status, arEntryId, metadata) {
  if (
    status === TRACKING_EVENT_STATUS.FULL_PAYMENT_COMPLETED ||
    status === TRACKING_EVENT_STATUS.PARTIAL_PAYMENT
  ) {
    logger.info('[tracking-notify] payment milestone', {
      arEntryId: String(arEntryId),
      status,
      metadata,
    });
  }
}

async function appendEventQuiet(arEntryId, invoiceNo, status, options = {}) {
  try {
    await addTrackingEvent(arEntryId, status, { ...options, invoiceNo });
  } catch (err) {
    logger.warn('[tracking] appendEventQuiet failed', {
      arEntryId: String(arEntryId),
      status,
      message: err.message,
    });
  }
}

async function createTracking(arEntryId) {
  const oid = toObjectId(arEntryId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);
  const entry = await arEntryRepository.findById(oid);
  if (!entry) throw new AppError('AR entry not found', 404);
  await arTrackingRepository.ensureDocument(oid, entry.invoiceNo);
  return arTrackingRepository.findByArEntryId(oid);
}

/**
 * @param {object} options
 * @param {string} [options.description]
 * @param {string} [options.label]
 * @param {object} [options.metadata]
 * @param {Date} [options.timestamp]
 * @param {string} [options.invoiceNo] override from AR row
 */
async function addTrackingEvent(arEntryId, status, options = {}) {
  if (!Object.values(TRACKING_EVENT_STATUS).includes(status)) {
    throw new AppError(`Unknown tracking status: ${status}`, 422);
  }

  const oid = toObjectId(arEntryId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const entry = await arEntryRepository.findById(oid);
  if (!entry) throw new AppError('AR entry not found', 404);

  const invoiceNo = options.invoiceNo != null ? String(options.invoiceNo) : entry.invoiceNo;
  const label =
    options.label && String(options.label).trim()
      ? String(options.label).trim()
      : TRACKING_DEFAULT_LABELS[status] || status;

  const description = resolveDescription(status, label, options.description);

  const event = {
    status,
    label,
    description,
    timestamp: options.timestamp || new Date(),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
  };

  await arTrackingRepository.appendEvent(oid, invoiceNo, event);
  await arEntryRepository.updateTrackingSummary(oid, status);
  notifyPaymentIfNeeded(status, oid, options.metadata);

  return event;
}

async function getTrackingTimeline(arEntryId) {
  const oid = toObjectId(arEntryId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const entry = await arEntryRepository.findById(oid);
  if (!entry) throw new AppError('AR entry not found', 404);

  let doc = await arTrackingRepository.findByArEntryId(oid);
  if (!doc) {
    return {
      arEntryId: String(oid),
      invoiceNo: entry.invoiceNo,
      timeline: [],
      stepper: buildStepperSteps([]),
      extraTimeline: [],
      sla: computeSlaMetrics([]),
      trackingSummary: {
        trackingCurrentStatus: entry.trackingCurrentStatus || '',
        trackingLastUpdatedAt: entry.trackingLastUpdatedAt || null,
      },
    };
  }

  const sorted = sortTimeline(doc.timeline || []);
  const mainStatuses = new Set(TRACKING_UI_STEP_ORDER);
  const extraTimeline = sorted.filter((e) => !mainStatuses.has(e.status));

  return {
    arEntryId: String(oid),
    invoiceNo: doc.invoiceNo || entry.invoiceNo,
    timeline: sorted,
    stepper: buildStepperSteps(sorted),
    extraTimeline,
    sla: computeSlaMetrics(sorted),
    trackingSummary: {
      trackingCurrentStatus: entry.trackingCurrentStatus || '',
      trackingLastUpdatedAt: entry.trackingLastUpdatedAt || null,
    },
  };
}

async function recordCoverLetterForEntries(entries) {
  await Promise.all(
    entries.map((e) =>
      appendEventQuiet(e._id, e.invoiceNo, TRACKING_EVENT_STATUS.COVER_LETTER_GENERATED, {
        metadata: { bundleSize: entries.length },
      }),
    ),
  );
}

async function recordPdfGeneratedForEntries(entries, finalPdfUrl) {
  await Promise.all(
    entries.map((e) =>
      appendEventQuiet(e._id, e.invoiceNo, TRACKING_EVENT_STATUS.PDF_GENERATED, {
        metadata: { finalPdfUrl },
      }),
    ),
  );
}

async function recordEmailSentAndDelivered(entries, mailMeta) {
  for (const e of entries) {
    await appendEventQuiet(e._id, e.invoiceNo, TRACKING_EVENT_STATUS.EMAIL_SENT, {
      metadata: { to: mailMeta.to, subject: mailMeta.subject },
    });
    await appendEventQuiet(e._id, e.invoiceNo, TRACKING_EVENT_STATUS.EMAIL_DELIVERED, {
      metadata: {
        messageId: mailMeta.messageId,
        accepted: mailMeta.accepted,
        rejected: mailMeta.rejected,
      },
    });
  }
}

/**
 * If EMAIL_SENT is older than SLA days and there is no meaningful client response, append ESCALATION_TRIGGERED once.
 */
async function evaluateEscalation(arEntryId) {
  const oid = toObjectId(arEntryId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const doc = await arTrackingRepository.findByArEntryId(oid);
  if (!doc?.timeline?.length) {
    return { escalated: false, reason: 'no_timeline' };
  }

  const sorted = sortTimeline(doc.timeline);
  let lastEmailSentTs = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].status === TRACKING_EVENT_STATUS.EMAIL_SENT) {
      lastEmailSentTs = new Date(sorted[i].timestamp).getTime();
      break;
    }
  }
  if (!lastEmailSentTs) return { escalated: false, reason: 'no_email_sent_event' };

  const responded = sorted.some(
    (ev) =>
      new Date(ev.timestamp).getTime() >= lastEmailSentTs &&
      RESPONSE_EVENTS_AFTER_EMAIL.has(ev.status),
  );
  if (responded) return { escalated: false, reason: 'client_already_engaged' };

  const slaDays = Number(process.env.TRACKING_RESPONSE_SLA_DAYS) || 7;
  const deadline = lastEmailSentTs + slaDays * 864e5;
  if (Date.now() < deadline) {
    return { escalated: false, reason: 'within_sla', slaDays, deadline: new Date(deadline) };
  }

  const escalatedAfterEmail = sorted.some(
    (ev) =>
      ev.status === TRACKING_EVENT_STATUS.ESCALATION_TRIGGERED &&
      new Date(ev.timestamp).getTime() >= lastEmailSentTs,
  );
  if (escalatedAfterEmail) return { escalated: false, reason: 'already_escalated' };

  await addTrackingEvent(oid, TRACKING_EVENT_STATUS.ESCALATION_TRIGGERED, {
    metadata: { reason: 'no_response_within_sla', slaDays },
  });

  logger.warn('[tracking-notify] SLA escalation recorded', {
    arEntryId: String(oid),
    slaDays,
  });

  return { escalated: true, slaDays };
}

module.exports = {
  createTracking,
  addTrackingEvent,
  getTrackingTimeline,
  evaluateEscalation,
  recordCoverLetterForEntries,
  recordPdfGeneratedForEntries,
  recordEmailSentAndDelivered,
};
