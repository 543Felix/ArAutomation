const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const emailController = require('./email.controller');
const emailValidation = require('./email.validation');

const router = express.Router();

router.get('/status', emailController.status);

router.use(authMiddleware);
router.post('/enqueue', validate(emailValidation.enqueue), emailController.enqueue);
router.post('/message', validate(emailValidation.addThreadMessage), emailController.postThreadMessage);
router.get(
  '/thread/:arId',
  validate(emailValidation.threadArIdParam),
  emailController.getEmailThread,
);
router.post(
  '/sync-thread/:arId',
  validate(emailValidation.syncEmailThread),
  emailController.syncEmailThread,
);
router.post('/send/:arId', validate(emailValidation.sendForAr), emailController.sendForAr);

module.exports = router;
