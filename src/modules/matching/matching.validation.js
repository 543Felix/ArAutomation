const Joi = require('joi');

const rank = {
  body: Joi.object({
    candidates: Joi.array()
      .items(
        Joi.object({
          id: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
          signals: Joi.object().pattern(Joi.string(), Joi.number()).optional(),
        }).unknown(true),
      )
      .default([]),
    weights: Joi.object().pattern(Joi.string(), Joi.number()).default({}),
  }),
};

module.exports = {
  rank,
};
