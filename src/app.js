const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const rootRoutes = require('./routes/root.routes');
const apiV1Routes = require('./routes/api/v1.routes');
const AppError = require('./utils/app-error');
const logger = require('./utils/logger');
const requestIdMiddleware = require('./middlewares/request-id');
const apiLimiter = require('./middlewares/api-limiter');
const { API_BASE_PATH, FILES_PUBLIC_PREFIX } = require('./config/api-constants');

function getStorageDir() {
  return process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage');
}

function buildCorsOptions() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw === '*') {
    return { origin: true };
  }
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 1) {
    return { origin: list[0] };
  }
  return { origin: list };
}

function jsonSyntaxErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('Invalid JSON request body', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      error: logger.serializeError(err),
    });
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
        requestId: req.id,
      },
    });
  }
  return next(err);
}

/** Same routers mounted at /api/v1 must not capture /api/files or /api/admin/* */
function shouldSkipLegacyApiMount(req) {
  const p = req.path || '';
  return (
    p === '/files' ||
    p.startsWith('/files/') ||
    p === '/admin' ||
    p.startsWith('/admin/')
  );
}

function errorHandler(err, req, res, _next) {
  const statusCode =
    err.statusCode && Number.isFinite(err.statusCode) ? Math.floor(err.statusCode) : 500;

  const isProduction = process.env.NODE_ENV === 'production';
  const message =
    statusCode === 500 && isProduction && !(err instanceof AppError)
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  const code = err.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'ERROR');

  const requestCtx = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode,
    responseCode: code,
  };

  if (statusCode >= 500) {
    logger.error('HTTP server error', {
      ...requestCtx,
      error: logger.serializeError(err),
    });
  } else if (statusCode === 404 && code === 'NOT_FOUND') {
    logger.info('HTTP not found', requestCtx);
  } else if (statusCode >= 400) {
    logger.warn('HTTP client error', {
      ...requestCtx,
      error: logger.serializeError(err),
    });
  }

  const payload = {
    success: false,
    error: {
      code,
      message,
      requestId: req.id,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };

  if (!isProduction && statusCode >= 500 && err.stack) {
    payload.error.stack = err.stack.split('\n').slice(0, 12).join('\n');
  }

  res.status(statusCode).json(payload);
}

async function createApp(options = {}) {
  const app = express();

  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(requestIdMiddleware);

  app.use(
    cors({
      ...buildCorsOptions(),
      credentials: process.env.CORS_CREDENTIALS === 'true',
      exposedHeaders: [process.env.REQUEST_ID_HEADER || 'x-request-id'],
    }),
  );

  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  const storageDir = getStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  app.use(FILES_PUBLIC_PREFIX, express.static(storageDir, { maxAge: '5m', fallthrough: true }));

  if (options.beforeRoutes) {
    await options.beforeRoutes(app);
  }

  app.use('/', rootRoutes);
  app.use(API_BASE_PATH, apiLimiter, apiV1Routes);

  if (process.env.DISABLE_LEGACY_API_MOUNT !== 'true') {
    app.use('/api', (req, res, next) => {
      if (shouldSkipLegacyApiMount(req)) {
        return next();
      }
      return apiLimiter(req, res, (err) => {
        if (err) return next(err);
        return apiV1Routes(req, res, next);
      });
    });
  }

  if (options.afterRoutes) {
    await options.afterRoutes(app);
  }

  app.use((_req, _res, next) => {
    next(new AppError('Not Found', 404, { code: 'NOT_FOUND' }));
  });

  app.use(jsonSyntaxErrorHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
