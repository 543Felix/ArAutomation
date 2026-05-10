/**
 * OpenAI settings for non-integration callers (email AI, etc.).
 * Chat HTTP client lives in `src/integrations/openai.client.js`.
 */
function getOpenAiConfig() {
  return {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 20_000,
  };
}

function isConfigured() {
  return Boolean(getOpenAiConfig().apiKey);
}

module.exports = {
  getOpenAiConfig,
  isConfigured,
};
