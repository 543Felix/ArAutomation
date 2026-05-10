const express = require('express');
const apiEnvelopeMiddleware = require('../../middlewares/api-envelope');
const authRoutes = require('../../modules/auth/auth.routes');
const userRoutes = require('../../modules/user/user.routes');
const arRoutes = require('../../modules/ar/ar.routes');
const invoiceRoutes = require('../../modules/invoice/invoice.routes');
const documentRoutes = require('../../modules/document/document.routes');
const matchingRoutes = require('../../modules/matching/matching.routes');
const emailRoutes = require('../../modules/email/email.routes');
const ecobillzRoutes = require('../../modules/ecobillz/ecobillz.routes');
const companyRoutes = require('../../modules/company/company.routes');
const trackingRoutes = require('../../modules/tracking/tracking.routes');

const router = express.Router();

router.use(apiEnvelopeMiddleware);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/companies', companyRoutes);
router.use('/tracking', trackingRoutes);
router.use('/ar-entries', arRoutes);
router.use('/invoice', invoiceRoutes);
router.use('/document', documentRoutes);
router.use('/matching', matchingRoutes);
router.use('/email', emailRoutes);
router.use('/ecobillz', ecobillzRoutes);

module.exports = router;
