const express = require('express');
const { API_BASE_PATH, SERVICE_NAME, SERVICE_VERSION } = require('../config/api-constants');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      api: {
        basePath: API_BASE_PATH,
        health: `${API_BASE_PATH}/health`,
      },
    },
  });
});

/** Lightweight readiness probe (use `/live` semantics kept minimal for LB/K8s) */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok' },
  });
});

module.exports = router;
