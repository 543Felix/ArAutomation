const Joi = require('joi');

const updateMe = {
  body: Joi.object({
    name: Joi.string().trim().max(200).optional(),
  }).min(1),
};

module.exports = {
  updateMe,
};
