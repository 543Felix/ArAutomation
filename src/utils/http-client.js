const logger = require('./logger');

const DEFAULT_TIMEOUT_MS = 30_000;

/** Avoid huge / sensitive query strings in logs (e.g. chequeDetails JSON). */
function urlForLog(fullUrl) {
  try {
    const u = new URL(fullUrl);
    const cd = u.searchParams.get('chequeDetails');
    if (cd) {
      u.searchParams.set('chequeDetails', `[omitted len=${cd.length}]`);
    }
    return u.toString();
  } catch {
    return String(fullUrl).slice(0, 240);
  }
}

async function withTimeout(url, fetchOptions, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function requestJson(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  try {
    const res = await withTimeout(url, fetchOptions, timeoutMs);
    const text = await res.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return body;
  } catch (err) {
    const meta = {
      url: urlForLog(url),
      method: fetchOptions.method || 'GET',
      error: logger.serializeError(err),
    };
    if (err.name === 'AbortError') {
      logger.error('httpClient.requestJson aborted (timeout)', meta);
    } else if (Number.isFinite(err.status)) {
      if (err.status >= 500) {
        logger.error('httpClient.requestJson upstream HTTP error', meta);
      } else {
        logger.warn('httpClient.requestJson upstream HTTP error', meta);
      }
    } else {
      logger.error('httpClient.requestJson failed', meta);
    }
    throw err;
  }
}

async function requestArrayBuffer(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  try {
    const res = await withTimeout(url, fetchOptions, timeoutMs);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      err.status = res.status;
      throw err;
    }
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch (err) {
    const meta = {
      url: urlForLog(url),
      method: fetchOptions.method || 'GET',
      error: logger.serializeError(err),
    };
    if (err.name === 'AbortError') {
      logger.error('httpClient.requestArrayBuffer aborted (timeout)', meta);
    } else if (Number.isFinite(err.status) && err.status >= 500) {
      logger.error('httpClient.requestArrayBuffer upstream HTTP error', meta);
    } else if (Number.isFinite(err.status)) {
      logger.warn('httpClient.requestArrayBuffer upstream HTTP error', meta);
    } else {
      logger.error('httpClient.requestArrayBuffer failed', meta);
    }
    throw err;
  }
}

module.exports = {
  requestJson,
  requestArrayBuffer,
};
