const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const emailController = require('./email.controller');
const emailValidation = require('./email.validation');

const router = express.Router();

router.get('/status', emailController.status);

router.use(authMiddleware);
router.post('/enqueue', validate(emailValidation.enqueue), emailController.enqueue);

module.exports = router;
