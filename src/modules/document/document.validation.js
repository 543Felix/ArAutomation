const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const metadata = {
  body: Joi.object({
    docId: Joi.string().max(200).required(),
    s3Url: Joi.string().uri({ scheme: ['http', 'https'] }).max(4000).required(),
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    docType: Joi.string().max(80).optional(),
  }),
};

const enqueuePdf = {
  body: Joi.object().unknown(true).default({}),
};

module.exports = {
  metadata,
  enqueuePdf,
};
