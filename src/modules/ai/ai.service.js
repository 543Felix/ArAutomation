const logger = require('../../utils/logger');
const openaiClient = require('../../integrations/openai.client');
const {
  renderTemplate,
  buildUserPrompt,
  findMissingPlaceholders,
  SYSTEM_PROMPT,
  COLLECTION_EMAIL_SYSTEM_PROMPT,
  buildCollectionEmailUserPrompt,
} = require('./ai.prompts');
const {
  AR_ANALYSIS_SYSTEM_PROMPT,
  buildArAnalysisUserPrompt,
} = require('./ai.analysis.prompts');
const { collectionEmailFallback } = require('../email/email.templates');

const SOURCE = Object.freeze({
  AI: 'ai',
  TEMPLATE: 'template',
  /** Deterministic analysis when AI disabled or fails */
  FALLBACK: 'fallback',
});

const LOG_PREFIX = '[cover-letter]';
const COLLECTION_PREFIX = '[collection-email]';
const AR_ANALYSIS_PREFIX = '[ar-analysis]';

const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);
const CUSTOMER_INTENTS = new Set(['PAYMENT', 'DELAY', 'DISPUTE', 'UNKNOWN']);

/** Non-null when AI refinement should not run */
function getAiDisabledReason() {
  if (process.env.AI_COVER_LETTER_ENABLED === 'false') {
    return 'AI_COVER_LETTER_ENABLED=false';
  }
  if (!openaiClient.isConfigured()) {
    return 'OPENAI_API_KEY not set';
  }
  return null;
}

function looksStructurallyValid(rendered, refined) {
  if (typeof refined !== 'string' || !refined.trim()) return false;

  const requiredAnchors = [
    'Account No',
    'Dear Sir / Madam',
    'Kind Attn:',
    'Yours sincerely',
    'CREDIT MANAGER',
    'Kindly note',
  ];
  for (const anchor of requiredAnchors) {
    if (!refined.includes(anchor)) return false;
  }

  const renderedLen = rendered.length;
  if (refined.length < Math.floor(renderedLen * 0.6)) return false;
  if (refined.length > Math.floor(renderedLen * 2.5)) return false;

  return true;
}

function explainStructuralFailure(rendered, refined) {
  const reasons = [];
  if (typeof refined !== 'string' || !refined.trim()) {
    reasons.push('empty_or_non_string_refined');
    return reasons;
  }

  const requiredAnchors = [
    'Account No',
    'Dear Sir / Madam',
    'Kind Attn:',
    'Yours sincerely',
    'CREDIT MANAGER',
    'Kindly note',
  ];
  for (const a of requiredAnchors) {
    if (!refined.includes(a)) reasons.push(`missing_anchor:${a}`);
  }

  const renderedLen = rendered.length;
  if (refined.length < Math.floor(renderedLen * 0.6)) {
    reasons.push(`too_short:refined=${refined.length}_min≈${Math.floor(renderedLen * 0.6)}`);
  }
  if (refined.length > Math.floor(renderedLen * 2.5)) {
    reasons.push(`too_long:refined=${refined.length}_max≈${Math.floor(renderedLen * 2.5)}`);
  }
  return reasons;
}

function refineWithAi({ rendered, missingDocuments }) {
  return openaiClient.chatComplete({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt({ renderedLetter: rendered, missingDocuments }),
    temperature: 0,
    maxTokens: 1500,
  });
}

/**
 * Generates the AR cover-letter text.
 *
 * Steps:
 *   1. Render the deterministic template from `data` (placeholders substituted in code).
 *   2. If AI is enabled and configured, ask the model to refine tone / grammar
 *      and (optionally) add a short missing-documents paragraph.
 *   3. Validate the model output preserves required structural anchors.
 *   4. On any failure, return the rendered template unchanged.
 *
 * @param {object} data Cover-letter data (see `ai.prompts.MANDATORY_PLACEHOLDERS`).
 * @param {string[]} [data.missingDocuments] Optional list of missing document names.
 * @returns {Promise<{ coverLetterText: string, source: 'ai'|'template', missingPlaceholders: string[] }>}
 */
async function generateCoverLetter(data = {}) {
  const missingDocCount = Array.isArray(data.missingDocuments)
    ? data.missingDocuments.filter((d) => d && String(d).trim()).length
    : 0;

  logger.info(`${LOG_PREFIX} start`, {
    step: 1,
    hasCustomerNo: Boolean(data.customerNo),
    hasCompanyName: Boolean(data.companyName),
    missingDocumentItems: missingDocCount,
  });

  const missingPlaceholders = findMissingPlaceholders(data);
  if (missingPlaceholders.length) {
    logger.warn(`${LOG_PREFIX} some template fields empty`, {
      step: 1,
      missingPlaceholders,
    });
  }

  const rendered = renderTemplate(data);
  logger.info(`${LOG_PREFIX} template rendered (placeholders replaced in code)`, {
    step: 2,
    renderedCharCount: rendered.length,
  });

  const skipReason = getAiDisabledReason();
  if (skipReason) {
    logger.info(`${LOG_PREFIX} skip OpenAI — using template only`, {
      step: 3,
      reason: skipReason,
      resultSource: SOURCE.TEMPLATE,
    });
    return {
      coverLetterText: rendered,
      source: SOURCE.TEMPLATE,
      missingPlaceholders,
    };
  }

  logger.info(`${LOG_PREFIX} calling OpenAI for tone / optional missing-doc paragraph`, {
    step: 3,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });

  try {
    const refined = await refineWithAi({
      rendered,
      missingDocuments: data.missingDocuments,
    });

    logger.info(`${LOG_PREFIX} OpenAI response received`, {
      step: 4,
      refinedCharCount: typeof refined === 'string' ? refined.length : 0,
    });

    if (!looksStructurallyValid(rendered, refined)) {
      const validationReasons = explainStructuralFailure(rendered, refined);
      logger.warn(`${LOG_PREFIX} refined text failed validation — using template`, {
        step: 5,
        validationReasons,
        renderedLen: rendered.length,
        refinedLen: typeof refined === 'string' ? refined.length : null,
        resultSource: SOURCE.TEMPLATE,
      });
      return {
        coverLetterText: rendered,
        source: SOURCE.TEMPLATE,
        missingPlaceholders,
      };
    }

    logger.info(`${LOG_PREFIX} complete — using AI-refined letter`, {
      step: 5,
      resultSource: SOURCE.AI,
    });

    return {
      coverLetterText: refined,
      source: SOURCE.AI,
      missingPlaceholders,
    };
  } catch (err) {
    logger.warn(`${LOG_PREFIX} OpenAI failed — using template only`, {
      step: 4,
      resultSource: SOURCE.TEMPLATE,
      error: logger.serializeError(err),
    });
    return {
      coverLetterText: rendered,
      source: SOURCE.TEMPLATE,
      missingPlaceholders,
    };
  }
}

function parseCollectionEmailJson(raw) {
  let text = String(raw || '').trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) text = fence[1].trim();
  const obj = JSON.parse(text);
  const subject = typeof obj.subject === 'string' ? obj.subject.trim() : '';
  const body = typeof obj.body === 'string' ? obj.body.trim() : '';
  if (!subject || !body) {
    throw new Error('collection_email_json_invalid_shape');
  }
  return { subject, body };
}

/**
 * @returns {Promise<{ subject: string, body: string, source: 'ai'|'template' }>}
 */
async function generateCollectionEmail(data = {}) {
  const fb = collectionEmailFallback(data);

  if (process.env.AI_COLLECTION_EMAIL_ENABLED === 'false') {
    logger.info(`${COLLECTION_PREFIX} disabled via AI_COLLECTION_EMAIL_ENABLED=false`);
    return { ...fb, source: SOURCE.TEMPLATE };
  }

  if (!openaiClient.isConfigured()) {
    logger.info(`${COLLECTION_PREFIX} OpenAI not configured — fallback template`);
    return { ...fb, source: SOURCE.TEMPLATE };
  }

  try {
    const raw = await openaiClient.chatComplete({
      system: COLLECTION_EMAIL_SYSTEM_PROMPT,
      user: buildCollectionEmailUserPrompt(data),
      temperature: 0,
      maxTokens: 900,
      responseFormat: 'json_object',
    });
    const { subject, body } = parseCollectionEmailJson(raw);
    logger.info(`${COLLECTION_PREFIX} OpenAI ok`, {
      subjectLen: subject.length,
      bodyLen: body.length,
    });
    return { subject, body, source: SOURCE.AI };
  } catch (err) {
    logger.warn(`${COLLECTION_PREFIX} OpenAI failed — fallback template`, {
      error: logger.serializeError(err),
    });
    return { ...fb, source: SOURCE.TEMPLATE };
  }
}

function stripJsonFence(raw) {
  let text = String(raw || '').trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fence) text = fence[1].trim();
  return text;
}

function parseArAnalysisJson(raw) {
  const text = stripJsonFence(raw);
  return JSON.parse(text);
}

function normalizeArAnalysis(obj) {
  const riskRaw = String(obj?.riskLevel || '').toUpperCase();
  const riskLevel = RISK_LEVELS.has(riskRaw) ? riskRaw : 'MEDIUM';
  const intentRaw = String(obj?.customerIntent || '').toUpperCase();
  const customerIntent = CUSTOMER_INTENTS.has(intentRaw) ? intentRaw : 'UNKNOWN';
  let paymentLikelihood = Number(obj?.paymentLikelihood);
  if (!Number.isFinite(paymentLikelihood)) paymentLikelihood = 50;
  paymentLikelihood = Math.min(100, Math.max(0, Math.round(paymentLikelihood)));

  return {
    currentStatus: String(obj?.currentStatus || 'Needs review').trim().slice(0, 500),
    riskLevel,
    customerIntent,
    paymentLikelihood,
    summary: String(obj?.summary || '').trim().slice(0, 2000),
    recommendedAction: String(obj?.recommendedAction || '').trim().slice(0, 1000),
  };
}

function buildFallbackArAnalysis(context = {}) {
  const missingCount = Array.isArray(context.missingDocsList) ? context.missingDocsList.length : 0;
  const paidFull = context.paymentStatusCode === 'PAID_FULL';
  const paidPartial = context.paymentStatusCode === 'PAID_PARTIAL';
  const portfolio = context.analysisScope === 'customer' && Number(context.arEntryCount) > 1;

  let riskLevel = 'MEDIUM';
  if (paidFull) riskLevel = 'LOW';
  else if (
    missingCount > 0 ||
    context.anyMissingDocuments ||
    context.rawEntryStatus === 'MISSING_DOCUMENTS'
  ) {
    riskLevel = 'HIGH';
  }

  let customerIntent = 'UNKNOWN';
  if (paidFull || paidPartial) customerIntent = 'PAYMENT';
  else if (missingCount > 0) customerIntent = 'DELAY';

  const paymentLikelihood = paidFull ? 100 : paidPartial ? 75 : missingCount > 0 ? 35 : 55;

  const summary = [
    portfolio
      ? `Customer portfolio: ${context.arEntryCount} AR row(s). Workflow mix: ${context.workflowStatusText || 'unknown'}.`
      : `Workflow: ${context.workflowStatusText || 'unknown'}.`,
    context.paymentStatusText || '',
    missingCount > 0 ? `${missingCount} missing cheque/document reference(s).` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .slice(0, 600);

  let recommendedAction = 'Review tracking timeline and latest customer email before next contact.';
  if (paidFull) recommendedAction = 'Close AR collection loop — confirm settlement in finance.';
  else if (missingCount > 0) {
    recommendedAction = 'Request outstanding cheque / bank documents before escalating.';
  } else if (context.paymentStatusCode === 'PAYMENT_INITIATED') {
    recommendedAction = 'Confirm payment receipt with treasury within 2–3 business days.';
  }

  return {
    currentStatus: paidFull
      ? portfolio
        ? 'Paid — all cohort invoices show full settlement in tracking'
        : 'Paid — tracking shows full settlement'
      : portfolio
        ? `Open — customer cohort (${context.arEntryCount} invoices): ${context.workflowStatusText || 'mixed states'}`
        : context.workflowStatusText
          ? `Open — ${context.workflowStatusText}`
          : 'Awaiting payment signals',
    riskLevel,
    customerIntent,
    paymentLikelihood,
    summary: summary || 'Insufficient structured signals — manual review recommended.',
    recommendedAction,
  };
}

function getArAnalysisDisabledReason() {
  if (process.env.AI_AR_ANALYSIS_ENABLED === 'false') {
    return 'AI_AR_ANALYSIS_ENABLED=false';
  }
  if (!openaiClient.isConfigured()) {
    return 'OPENAI_API_KEY not set';
  }
  return null;
}

/**
 * Agentic AR analysis — OpenAI JSON output with validation and deterministic fallback.
 *
 * @param {object} context — output of {@link ./ai.analysis.context.buildArAnalysisContext}
 * @returns {Promise<{ analysis: object, source: 'ai'|'fallback', detail?: string }>}
 */
async function analyzeAR(context = {}) {
  const fallback = () => ({
    analysis: buildFallbackArAnalysis(context),
    source: SOURCE.FALLBACK,
    detail: 'fallback',
  });

  const skipReason = getArAnalysisDisabledReason();
  if (skipReason) {
    logger.info(`${AR_ANALYSIS_PREFIX} skip OpenAI`, { reason: skipReason });
    return { ...fallback(), detail: skipReason };
  }

  const user = buildArAnalysisUserPrompt(context);
  const rawRetry = process.env.AI_AR_ANALYSIS_RETRY_ATTEMPTS;
  let maxAttempts = 2;
  if (rawRetry != null && String(rawRetry).trim() !== '') {
    const n = Number(rawRetry);
    if (Number.isFinite(n)) maxAttempts = Math.min(5, Math.max(1, n));
  }

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await openaiClient.chatComplete({
        system: AR_ANALYSIS_SYSTEM_PROMPT,
        user,
        temperature: 0.25,
        maxTokens: 900,
        responseFormat: 'json_object',
      });
      const parsed = parseArAnalysisJson(raw);
      const analysis = normalizeArAnalysis(parsed);
      logger.info(`${AR_ANALYSIS_PREFIX} OpenAI ok`, { attempt });
      return { analysis, source: SOURCE.AI };
    } catch (err) {
      lastErr = err;
      logger.warn(`${AR_ANALYSIS_PREFIX} attempt failed`, {
        attempt,
        error: logger.serializeError(err),
      });
    }
  }

  logger.warn(`${AR_ANALYSIS_PREFIX} all attempts failed — using fallback`, {
    message: lastErr?.message,
  });
  return {
    ...fallback(),
    detail: lastErr?.message ? String(lastErr.message).slice(0, 500) : 'openai_failed',
  };
}

module.exports = {
  generateCoverLetter,
  generateCollectionEmail,
  analyzeAR,
  SOURCE,
};
