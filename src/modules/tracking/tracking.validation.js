const Joi = require('joi');
const { TRACKING_EVENT_STATUS } = require('../ar/ar-tracking.constants');

const objectId = Joi.string().hex().length(24);
const statusValues = Object.values(TRACKING_EVENT_STATUS);

const arIdParam = {
  params: Joi.object({
    arId: objectId.required(),
  }),
};

const updateEvent = {
  body: Joi.object({
    arId: objectId.required(),
    status: Joi.string()
      .valid(...statusValues)
      .required(),
    label: Joi.string().trim().max(200).optional(),
    description: Joi.string().trim().max(5000).optional(),
    metadata: Joi.object().unknown(true).optional(),
  }),
};

module.exports = {
  arIdParam,
  updateEvent,
};
