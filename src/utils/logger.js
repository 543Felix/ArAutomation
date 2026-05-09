const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };

function resolveLevel() {
  const raw = String(process.env.LOG_LEVEL || '').toLowerCase();
  if (raw && LEVEL_ORDER[raw] !== undefined) return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

let cachedLevel = resolveLevel();

function levelEnabled(level) {
  return LEVEL_ORDER[level] <= LEVEL_ORDER[cachedLevel];
}

function timestamp() {
  return new Date().toISOString();
}

function truncate(str, max = 500) {
  if (str == null) return str;
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Flatten Error / fetch failures into JSON-safe log metadata (no circular refs).
 */
function serializeError(err) {
  if (err == null) return {};
  if (typeof err !== 'object') {
    return { message: String(err) };
  }

  const out = {
    type: err.constructor?.name || 'Error',
    message: err.message || '(no message)',
  };

  if (err.code != null) out.code = err.code;
  if (Number.isFinite(err.statusCode)) out.statusCode = err.statusCode;
  if (Number.isFinite(err.status)) out.httpStatus = err.status;

  if (err.body !== undefined) {
    try {
      out.responseBody = truncate(typeof err.body === 'string' ? err.body : JSON.stringify(err.body), 800);
    } catch {
      out.responseBody = '(unserializable body)';
    }
  }

  if (err.details !== undefined) {
    try {
      out.details = truncate(JSON.stringify(err.details), 1200);
    } catch {
      out.details = '(unserializable details)';
    }
  }

  const includeStack =
    process.env.LOG_STACK === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.LOG_STACK !== 'false');

  if (includeStack && typeof err.stack === 'string') {
    out.stack = err.stack.split('\n').slice(0, 14).join('\n');
  }

  return out;
}

function format(level, message, meta) {
  const payload = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp()} [${level}] ${message}${payload}`;
}

module.exports = {
  serializeError,

  /** Reload LOG_LEVEL from env (tests). */
  reloadLevel() {
    cachedLevel = resolveLevel();
  },

  debug(message, meta) {
    if (!levelEnabled('debug')) return;
    console.log(format('DEBUG', message, meta));
  },

  info(message, meta) {
    if (!levelEnabled('info')) return;
    console.log(format('INFO', message, meta));
  },

  warn(message, meta) {
    if (!levelEnabled('warn')) return;
    console.warn(format('WARN', message, meta));
  },

  error(message, meta) {
    if (!levelEnabled('error')) return;
    console.error(format('ERROR', message, meta));
  },
};
