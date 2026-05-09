const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
