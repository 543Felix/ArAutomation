const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const matchingController = require('./matching.controller');
const matchingValidation = require('./matching.validation');

const router = express.Router();

router.get('/status', matchingController.status);

router.use(authMiddleware);
router.post('/rank', validate(matchingValidation.rank), matchingController.rank);

module.exports = router;
