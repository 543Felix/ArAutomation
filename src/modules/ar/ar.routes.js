const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const arController = require('./ar.controller');
const arValidation = require('./ar.validation');

const router = express.Router();

router.get('/status', arController.status);

router.use(authMiddleware);
router.get('/', validate(arValidation.listEntries), arController.list);
router.post('/run', validate(arValidation.triggerRun), arController.triggerRun);
router.get('/:id', validate(arValidation.entryIdParam), arController.detail);
router.post('/:id/send-email', validate(arValidation.sendEmail), arController.sendEmail);

module.exports = router;
