const { Queue } = require('bullmq');
const logger = require('../../../utils/logger');
const baseService = require('../jobs-base.service');
const { initWorkerIfEnabled, stopWorkerIfEnabled } = require('./ar-processing.worker');
const { AR_JOB_NAMES } = require('../../ar/ar.constants');

/** @type {import('bullmq').Queue | undefined} */
let queue;

const DAILY_REPEAT_KEY = 'ar-processing-daily';

function ensureQueue() {
  if (!queue) {
    throw new Error('AR processing queue not initialized. Call init() first.');
  }
  return queue;
}

const defaultJobOptions = {
  attempts: Number(process.env.AR_JOB_ATTEMPTS) || 3,
  backoff: {
    type: 'exponential',
    delay: Number(process.env.AR_JOB_BACKOFF_MS) || 5000,
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
};

async function scheduleProcessTarget(target) {
  const job = await ensureQueue().add(
    AR_JOB_NAMES.PROCESS_TARGET,
    { ...target, scheduledAt: new Date() },
    defaultJobOptions,
  );
  logger.info('AR target job scheduled', { jobId: job.id });
  return job.id;
}

async function scheduleDaily() {
  const cron = process.env.AR_DAILY_CRON || '0 2 * * *';
  const tz = process.env.AR_DAILY_TZ || 'Asia/Kolkata';

  await ensureQueue().add(
    AR_JOB_NAMES.DAILY,
    {},
    {
      ...defaultJobOptions,
      jobId: DAILY_REPEAT_KEY,
      repeat: { pattern: cron, tz },
    },
  );

  logger.info('AR daily job scheduled', { cron, tz });
}

async function init(jobConfiguration = {}) {
  if (jobConfiguration.enabled === false) {
    logger.warn('AR processing queue disabled by config');
    return;
  }

  queue = new Queue(
    baseService.QUEUES.SCHEDULE_AR_PROCESSING,
    baseService.getDefaultQueueOptions(),
  );

  queue.on('error', (err) => {
    logger.error('AR queue error', { message: err.message });
  });

  initWorkerIfEnabled(jobConfiguration);

  if (process.env.AR_DAILY_DISABLED !== 'true') {
    try {
      await scheduleDaily();
    } catch (err) {
      logger.warn('Failed to schedule AR daily job', { message: err.message });
    }
  }
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
  scheduleProcessTarget,
  scheduleDaily,
};
