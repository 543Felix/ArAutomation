const express = require('express');
const validate = require('../../middlewares/validate');
const userController = require('./user.controller');
const authMiddleware = require('../auth/auth.middleware');
const userValidation = require('./user.validation');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', userController.getMe);
router.patch('/me', validate(userValidation.updateMe), userController.updateMe);
router.get('/', userController.list);

module.exports = router;
