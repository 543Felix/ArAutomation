const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const documentController = require('./document.controller');
const documentValidation = require('./document.validation');

const router = express.Router();

router.get('/status', documentController.status);

router.use(authMiddleware);
router.post('/metadata', validate(documentValidation.metadata), documentController.metadata);
router.post('/pdf/enqueue', validate(documentValidation.enqueuePdf), documentController.enqueuePdf);

module.exports = router;
