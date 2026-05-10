const logger = require('../../utils/logger');
const openaiClient = require('../../integrations/openai.client');
const {
  renderTemplate,
  buildUserPrompt,
  findMissingPlaceholders,
  SYSTEM_PROMPT,
} = require('./ai.prompts');

const SOURCE = Object.freeze({
  AI: 'ai',
  TEMPLATE: 'template',
});

function isAiEnabled() {
  return process.env.AI_COVER_LETTER_ENABLED !== 'false' && openaiClient.isConfigured();
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
  const missingPlaceholders = findMissingPlaceholders(data);
  if (missingPlaceholders.length) {
    logger.warn('Cover letter rendered with missing placeholders', {
      missingPlaceholders,
    });
  }

  const rendered = renderTemplate(data);

  if (!isAiEnabled()) {
    return {
      coverLetterText: rendered,
      source: SOURCE.TEMPLATE,
      missingPlaceholders,
    };
  }

  try {
    const refined = await refineWithAi({
      rendered,
      missingDocuments: data.missingDocuments,
    });

    if (!looksStructurallyValid(rendered, refined)) {
      logger.warn('AI cover-letter output failed structural validation; using template', {
        renderedLen: rendered.length,
        refinedLen: typeof refined === 'string' ? refined.length : null,
      });
      return {
        coverLetterText: rendered,
        source: SOURCE.TEMPLATE,
        missingPlaceholders,
      };
    }

    return {
      coverLetterText: refined,
      source: SOURCE.AI,
      missingPlaceholders,
    };
  } catch (err) {
    logger.warn('AI cover-letter refinement failed; returning template', {
      error: logger.serializeError(err),
    });
    return {
      coverLetterText: rendered,
      source: SOURCE.TEMPLATE,
      missingPlaceholders,
    };
  }
}

module.exports = {
  generateCoverLetter,
  SOURCE,
};
