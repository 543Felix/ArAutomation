const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

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

const sendForAr = {
  params: Joi.object({
    arId: objectId.required(),
  }),
  body: Joi.object({
    to: Joi.string().email().optional(),
    customerEmail: Joi.string().email().optional(),
  })
    .unknown(false)
    .default({}),
};

module.exports = {
  enqueue,
  sendForAr,
};
