/**
 * Wrap JSON bodies as `{ success: true, data }` for a consistent API contract.
 * Skips wrapping when `success` is already present or when `res.locals.skipEnvelope` is true.
 */
function apiEnvelopeMiddleware(_req, res, next) {
  if (res.locals.skipEnvelope) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function envelopeJson(body) {
    if (res.locals.skipEnvelope) {
      return originalJson(body);
    }
    if (body !== null && typeof body === 'object' && !Array.isArray(body) && 'success' in body) {
      return originalJson(body);
    }
    return originalJson({ success: true, data: body });
  };

  next();
}

module.exports = apiEnvelopeMiddleware;
