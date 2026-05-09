const Joi = require('joi');

const preview = {
  body: Joi.object({
    invoiceNo: Joi.string().max(120).optional(),
    amount: Joi.number().optional(),
    reference: Joi.string().optional(),
  })
    .unknown(true)
    .default({}),
};

module.exports = {
  preview,
};
