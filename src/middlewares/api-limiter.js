const rateLimit = require('express-rate-limit');

function tooManyRequestsMessage() {
  return {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this client; please try again later.',
    },
  };
}

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res, _next, options) {
    const payload = tooManyRequestsMessage();
    payload.error.requestId = req.id;
    res.status(options.statusCode).json(payload);
  },
});

module.exports = apiLimiter;
