const asyncHandler = require('../../utils/async-handler');
const trackingService = require('./tracking.service');

const getTimeline = asyncHandler(async (req, res) => {
  const data = await trackingService.getTrackingTimeline(req.params.arId);
  res.json(data);
});

const updateEvent = asyncHandler(async (req, res) => {
  const { arId, status, label, description, metadata } = req.body;
  const event = await trackingService.addTrackingEvent(arId, status, {
    label,
    description,
    metadata,
  });
  res.status(201).json({ event });
});

const createTracking = asyncHandler(async (req, res) => {
  const doc = await trackingService.createTracking(req.params.arId);
  res.status(201).json({ tracking: doc });
});

const evaluateEscalation = asyncHandler(async (req, res) => {
  const result = await trackingService.evaluateEscalation(req.params.arId);
  res.json(result);
});

module.exports = {
  getTimeline,
  updateEvent,
  createTracking,
  evaluateEscalation,
};
