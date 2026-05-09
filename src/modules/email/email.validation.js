const Joi = require('joi');

const enqueue = {
  body: Joi.object({
    to: Joi.string().email().optional(),
    subject: Joi.string().max(500).optional(),
    body: Joi.string().max(50000).optional(),
    attachmentUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(4000).optional(),
  })
    .unknown(true)
    .default({}),
};

module.exports = {
  enqueue,
};
