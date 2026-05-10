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

const threadArIdParam = {
  params: Joi.object({
    arId: objectId.required(),
  }),
};

const syncEmailThreadBody = {
  body: Joi.object({
    sinceDays: Joi.number().integer().min(1).max(30).optional(),
    searchAll: Joi.boolean().optional(),
    maxFetch: Joi.number().integer().min(1).max(500).optional(),
  })
    .unknown(false)
    .default({}),
};

const syncEmailThread = {
  params: threadArIdParam.params,
  body: syncEmailThreadBody.body,
};

const addThreadMessage = {
  body: Joi.object({
    arId: objectId.required(),
    messageId: Joi.string().trim().min(1).max(500).required(),
    direction: Joi.string().valid('OUTBOUND', 'INBOUND').required(),
    from: Joi.string().trim().max(500).required(),
    to: Joi.string().trim().max(500).required(),
    subject: Joi.string().trim().max(1000).allow('').optional(),
    body: Joi.string().trim().max(500000).allow('').optional(),
    timestamp: Joi.date().iso().optional(),
    invoiceNo: Joi.string().trim().max(120).optional(),
    aiAnalysis: Joi.object({
      intent: Joi.string().trim().max(500).optional(),
      summary: Joi.string().trim().max(5000).optional(),
    }).optional(),
    metadata: Joi.object().unknown(true).optional(),
  }),
};

module.exports = {
  enqueue,
  sendForAr,
  threadArIdParam,
  syncEmailThread,
  addThreadMessage,
};
