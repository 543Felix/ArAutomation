const Joi = require('joi');

const passwordMin = Number(process.env.PASSWORD_MIN_LENGTH) || 8;

const register = {
  body: Joi.object({
    email: Joi.string().email().max(320).required(),
    password: Joi.string().min(passwordMin).max(128).required(),
    name: Joi.string().trim().max(200).allow('').optional(),
  }),
};

const login = {
  body: Joi.object({
    email: Joi.string().email().max(320).required(),
    password: Joi.string().max(128).required(),
  }),
};

module.exports = {
  register,
  login,
};
