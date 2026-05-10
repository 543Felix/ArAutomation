const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const analyzeArParams = {
  params: Joi.object({
    arId: objectId.required(),
  }),
};

module.exports = {
  analyzeArParams,
};
