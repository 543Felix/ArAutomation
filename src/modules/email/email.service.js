const logger = require('../../utils/logger');

async function queueOutbound(payload) {
  logger.info('Email outbound stub', {
    to: payload?.to,
    subject: payload?.subject,
  });
  return { queued: false, stub: true };
}

module.exports = {
  queueOutbound,
};
