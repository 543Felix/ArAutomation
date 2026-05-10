const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const email = Joi.string().email().max(320).required();

const baseFields = {
  name: Joi.string().trim().min(1).max(200).required(),
  email,
  addressLine1: Joi.string().trim().min(1).max(300).required(),
  addressLine2: Joi.string().trim().max(300).allow('').optional(),
  city: Joi.string().trim().max(120).allow('').optional(),
  state: Joi.string().trim().max(120).allow('').optional(),
  country: Joi.string().trim().max(120).allow('').optional(),
  pincode: Joi.string().trim().max(20).allow('').optional(),
  phone: Joi.string().trim().max(40).allow('').optional(),
  website: Joi.alternatives()
    .try(Joi.string().trim().allow(''), Joi.string().trim().uri({ allowRelative: false }).max(500))
    .optional(),
  taxId: Joi.string().trim().max(32).allow('').optional(),
  notes: Joi.string().trim().max(5000).allow('').optional(),
};

const create = {
  body: Joi.object(baseFields),
};

const update = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().min(1).max(200).optional(),
    email: Joi.string().email().max(320).optional(),
    addressLine1: Joi.string().trim().min(1).max(300).optional(),
    addressLine2: Joi.string().trim().max(300).allow('').optional(),
    city: Joi.string().trim().max(120).allow('').optional(),
    state: Joi.string().trim().max(120).allow('').optional(),
    country: Joi.string().trim().max(120).allow('').optional(),
    pincode: Joi.string().trim().max(20).allow('').optional(),
    phone: Joi.string().trim().max(40).allow('').optional(),
    website: Joi.alternatives()
    .try(Joi.string().trim().allow(''), Joi.string().trim().uri({ allowRelative: false }).max(500))
    .optional(),
    taxId: Joi.string().trim().max(32).allow('').optional(),
    notes: Joi.string().trim().max(5000).allow('').optional(),
  }).min(1),
};

const idParam = {
  params: Joi.object({ id: objectId.required() }),
};

const listQuery = {
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    q: Joi.string().trim().max(200).optional(),
  }),
};

module.exports = {
  create,
  update,
  idParam,
  listQuery,
};
