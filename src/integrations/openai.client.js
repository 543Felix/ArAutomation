const logger = require('../utils/logger');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 20_000;

const LOG_PREFIX = '[openai]';

function getConfig() {
  return {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    baseUrl: (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

function hostFromUrl(urlStr) {
  try {
    return new URL(urlStr).host;
  } catch {
    return '(invalid-url)';
  }
}

function isConfigured() {
  return Boolean(getConfig().apiKey);
}

/**
 * Calls OpenAI Chat Completions and returns plain text content.
 * Throws on non-2xx, network, or shape errors. Caller is expected to wrap
 * in a try/catch and apply a failsafe — this module does not silence errors.
 */
async function chatComplete({
  system,
  user,
  temperature = 0,
  maxTokens = 1500,
  responseFormat,
}) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'OPENAI_NOT_CONFIGURED';
    throw err;
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const systemLen = typeof system === 'string' ? system.length : 0;
  const userLen = typeof user === 'string' ? user.length : 0;

  logger.info(`${LOG_PREFIX} chat.completions request`, {
    step: 'request',
    model: cfg.model,
    host: hostFromUrl(cfg.baseUrl),
    timeoutMs: cfg.timeoutMs,
    systemCharCount: systemLen,
    userCharCount: userLen,
    temperature,
    maxTokens,
  });

  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature,
        max_tokens: maxTokens,
        ...(responseFormat === 'json_object'
          ? { response_format: { type: 'json_object' } }
          : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      logger.warn(`${LOG_PREFIX} request aborted (timeout)`, {
        step: 'error',
        timeoutMs: cfg.timeoutMs,
        durationMs: Date.now() - started,
      });
      const e = new Error(`OpenAI request timed out after ${cfg.timeoutMs}ms`);
      e.code = 'OPENAI_TIMEOUT';
      throw e;
    }
    logger.warn(`${LOG_PREFIX} network error`, {
      step: 'error',
      durationMs: Date.now() - started,
      error: logger.serializeError(err),
    });
    throw err;
  }
  clearTimeout(timer);

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    logger.warn(`${LOG_PREFIX} HTTP error`, {
      step: 'error',
      status: res.status,
      durationMs: Date.now() - started,
      bodyPreview:
        typeof body === 'object' && body !== null
          ? JSON.stringify(body).slice(0, 400)
          : String(body).slice(0, 400),
    });
    const err = new Error(`OpenAI HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    err.code = 'OPENAI_HTTP_ERROR';
    throw err;
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    logger.warn(`${LOG_PREFIX} empty message content in response`, {
      step: 'error',
      durationMs: Date.now() - started,
      choicesLength: body?.choices?.length,
    });
    const err = new Error('OpenAI response missing message content');
    err.code = 'OPENAI_EMPTY_RESPONSE';
    err.body = body;
    throw err;
  }

  const durationMs = Date.now() - started;
  logger.info(`${LOG_PREFIX} chat.completions ok`, {
    step: 'response',
    durationMs,
    model: cfg.model,
    contentCharCount: content.trim().length,
    usage: body?.usage,
  });

  return content.trim();
}

module.exports = {
  chatComplete,
  isConfigured,
  getConfig,
};
