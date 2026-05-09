const Joi = require('joi');
const { AR_STATUS } = require('./ar.constants');

const objectId = Joi.string().hex().length(24);
const statusValues = Object.values(AR_STATUS);

const listEntries = {
  query: Joi.object({
    status: Joi.string()
      .valid(...statusValues)
      .optional(),
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
  }),
};

const entryIdParam = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

const triggerRun = {
  body: Joi.object({
    merchantId: objectId.required(),
    outletId: objectId.required(),
    fromDate: Joi.date().iso().optional(),
    toDate: Joi.date().iso().optional(),
  }),
};

const sendEmail = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    to: Joi.string().email().optional(),
    subject: Joi.string().max(500).optional(),
    body: Joi.string().max(10000).optional(),
  }).default({}),
};

module.exports = {
  listEntries,
  entryIdParam,
  triggerRun,
  sendEmail,
};
