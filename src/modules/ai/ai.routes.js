const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const aiController = require('./ai.controller');
const aiValidation = require('./ai.validation');

const router = express.Router();

router.use(authMiddleware);

/** Customer-level cohort analysis (anchor AR id selects merchant/outlet + billing bucket ± guest). */
router.post(
  '/analyze/ar/:arId',
  validate(aiValidation.analyzeArParams),
  aiController.analyzeAr,
);

module.exports = router;
