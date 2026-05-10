const { Queue } = require('bullmq');
const logger = require('../../../utils/logger');
const baseService = require('../jobs-base.service');
const { initWorkerIfEnabled, stopWorkerIfEnabled } = require('./pdf-creation.worker');
const { PDF_JOB_NAMES } = require('../../ar/ar.constants');

/** @type {import('bullmq').Queue | undefined} */
let queue;

function ensureQueue() {
  if (!queue) {
    throw new Error('PDF creation queue not initialized. Call init() first.');
  }
  return queue;
}

const defaultJobOptions = {
  attempts: Number(process.env.PDF_JOB_ATTEMPTS) || 3,
  backoff: {
    type: 'exponential',
    delay: Number(process.env.PDF_JOB_BACKOFF_MS) || 5000,
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
};

async function schedulePdfCreation({ arEntryId, arEntryIds } = {}) {
  const ids =
    Array.isArray(arEntryIds) && arEntryIds.length > 0
      ? [...new Set(arEntryIds.map(String).filter(Boolean))]
      : arEntryId != null && String(arEntryId).trim()
        ? [String(arEntryId).trim()]
        : [];
  if (!ids.length) {
    throw new Error('arEntryId or non-empty arEntryIds is required to schedule PDF_CREATION_JOB');
  }

  const job = await ensureQueue().add(
    PDF_JOB_NAMES.CREATE,
    { arEntryIds: ids, scheduledAt: new Date() },
    defaultJobOptions,
  );
  logger.info('PDF job scheduled', { jobId: job.id, arEntryIds: ids });
  return job.id;
}

async function init(jobConfiguration = {}) {
  if (jobConfiguration.enabled === false) {
    logger.warn('PDF creation queue disabled by config');
    return;
  }

  queue = new Queue(
    baseService.QUEUES.SCHEDULE_PDF_CREATION,
    baseService.getDefaultQueueOptions(),
  );

  queue.on('error', (err) => {
    logger.error('PDF queue error', { message: err.message });
  });

  initWorkerIfEnabled(jobConfiguration);
}

async function stop() {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
  await stopWorkerIfEnabled();
}

module.exports = {
  init,
  stop,
  queue: ensureQueue,
  schedulePdfCreation,
};
