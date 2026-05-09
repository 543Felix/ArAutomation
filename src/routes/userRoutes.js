const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);
router.get('/', userController.list);

module.exports = router;
