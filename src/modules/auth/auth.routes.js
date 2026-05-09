const express = require('express');
const validate = require('../../middlewares/validate');
const authController = require('./auth.controller');
const authMiddleware = require('./auth.middleware');
const userController = require('../user/user.controller');
const authValidation = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);

/** Alias for GET /users/me — common expectation under /auth */
router.get('/me', authMiddleware, userController.getMe);

module.exports = router;
