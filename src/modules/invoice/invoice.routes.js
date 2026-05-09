const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const invoiceController = require('./invoice.controller');
const invoiceValidation = require('./invoice.validation');

const router = express.Router();

router.get('/status', invoiceController.status);

router.use(authMiddleware);
router.post('/preview', validate(invoiceValidation.preview), invoiceController.preview);

module.exports = router;
