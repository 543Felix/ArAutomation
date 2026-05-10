const asyncHandler = require('../../utils/async-handler');
const AppError = require('../../utils/app-error');
const { toObjectId } = require('../../data/mongo/object-id.util');
const { arEntryRepository } = require('../../data/repositories');
const arTrackingRepository = require('../../data/mongo/ar-tracking.mongo.repository');
const emailThreadRepository = require('../../data/mongo/email-thread.mongo.repository');
const { customerScopeSummary } = require('../ar/customer-scope.util');
const { buildCustomerAnalysisContext } = require('./ai.analysis.context');
const aiService = require('./ai.service');

/**
 * POST .../analyze/ar/:arId — **customer-level** analysis.
 * `arId` is an anchor row; all AR entries in the same merchant/outlet + billing bucket (± guestId) are included.
 */
const analyzeAr = asyncHandler(async (req, res) => {
  const arId = req.params.arId;
  const oid = toObjectId(arId);
  if (!oid) {
    throw new AppError('Invalid AR entry id', 400);
  }

  const anchor = await arEntryRepository.findById(oid);
  if (!anchor) {
    throw new AppError('AR entry not found', 404);
  }

  const cohortEntries = await arEntryRepository.findEntriesForCustomerGroup(anchor);
  if (!cohortEntries.length) {
    throw new AppError('No AR rows found for customer cohort', 404);
  }

  const entryIds = cohortEntries.map((e) => e._id);
  const [trackingDocs, emailThreads] = await Promise.all([
    arTrackingRepository.findByArEntryIds(entryIds),
    emailThreadRepository.findByArEntryIds(entryIds),
  ]);

  const context = buildCustomerAnalysisContext({
    anchorEntry: anchor,
    entries: cohortEntries,
    trackingDocs,
    emailThreads,
  });

  const { analysis, source, detail: failDetail } = await aiService.analyzeAR(context);

  const persist = process.env.AI_AR_ANALYSIS_PERSIST !== 'false';
  let persistedAt = null;
  const customerScope = customerScopeSummary(anchor, entryIds);

  const persistPayload = {
    ...analysis,
    source,
    anchorArId: String(oid),
    customerScope,
    ...(failDetail && source === aiService.SOURCE.FALLBACK ? { fallbackDetail: failDetail } : {}),
    generatedAt: new Date().toISOString(),
  };

  if (persist) {
    await arEntryRepository.setAgentAnalysisMany(entryIds, persistPayload);
    persistedAt = new Date().toISOString();
  }

  res.json({
    anchorArId: String(oid),
    customerScope,
    ...analysis,
    source,
    persisted: persist,
    ...(persistedAt ? { persistedAt } : {}),
  });
});

module.exports = {
  analyzeAr,
};
