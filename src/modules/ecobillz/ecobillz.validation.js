const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const arPostedEntriesQuery = {
  query: Joi.object({
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    fromDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    toDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
  }),
};

const invoicesQuery = {
  query: Joi.object({
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    invoiceNo: Joi.string().trim().max(128).optional(),
    invoiceDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    arrivalDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    departureDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    businessDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    fromDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
    toDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
  }),
};

const chequeDetailItem = Joi.object({
  chequeNo: Joi.string().trim().min(1).max(128).required(),
  chequeDate: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim().max(40)).optional(),
});

const getChequesBody = {
  body: Joi.object({
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    chequeDetails: Joi.array().items(chequeDetailItem).min(1).required(),
  }),
};

const getChequesQuery = {
  query: Joi.object({
    merchantId: objectId.optional(),
    outletId: objectId.optional(),
    chequeDetails: Joi.string().trim().min(2).required(),
  }),
};

module.exports = {
  arPostedEntriesQuery,
  invoicesQuery,
  getChequesBody,
  getChequesQuery,
};
