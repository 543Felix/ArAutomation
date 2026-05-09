const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const ecobillzController = require('./ecobillz.controller');
const ecobillzValidation = require('./ecobillz.validation');

const router = express.Router();

router.get('/status', ecobillzController.status);

router.use(authMiddleware);
router.get(
  '/ar-posted-entries',
  validate(ecobillzValidation.arPostedEntriesQuery),
  ecobillzController.arPostedEntries,
);
router.get('/invoices', validate(ecobillzValidation.invoicesQuery), ecobillzController.invoices);

router.post(
  '/get-cheques',
  validate(ecobillzValidation.getChequesBody),
  ecobillzController.getChequesPost,
);
router.get(
  '/get-cheques',
  validate(ecobillzValidation.getChequesQuery),
  ecobillzController.getChequesGet,
);

module.exports = router;
