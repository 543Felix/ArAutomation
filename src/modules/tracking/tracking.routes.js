const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const trackingController = require('./tracking.controller');
const trackingValidation = require('./tracking.validation');

const router = express.Router();

router.use(authMiddleware);

router.post('/update', validate(trackingValidation.updateEvent), trackingController.updateEvent);
router.post(
  '/:arId/evaluate-escalation',
  validate(trackingValidation.arIdParam),
  trackingController.evaluateEscalation,
);
router.post(
  '/:arId/init',
  validate(trackingValidation.arIdParam),
  trackingController.createTracking,
);
router.get('/:arId', validate(trackingValidation.arIdParam), trackingController.getTimeline);

module.exports = router;
