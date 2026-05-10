const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const baseService = require('../modules/jobs/jobs-base.service');
const { initWorkerIfEnabled, stopWorkerIfEnabled } = require('../modules/jobs/email.processor');
const { EMAIL_JOB_NAMES } = require('../modules/ar/ar.constants');

/** @type {import('bullmq').Queue | undefined} */
let queue;

function ensureQueue() {
  if (!queue) {
    throw new Error('EMAIL_QUEUE not initialized. Call init() first.');
  }
  return queue;
}

const defaultJobOptions = {
  attempts: Number(process.env.EMAIL_JOB_ATTEMPTS) || 3,
  backoff: {
    type: 'exponential',
    delay: Number(process.env.EMAIL_JOB_BACKOFF_MS) || 5000,
  },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
};

async function scheduleSendEmailJob(payload) {
  const job = await ensureQueue().add(
    EMAIL_JOB_NAMES.SEND,
    { ...payload, scheduledAt: new Date() },
    defaultJobOptions,
  );
  logger.info('Email send job scheduled', { jobId: job.id, arId: payload?.arId });
  return job.id;
}

async function init(jobConfiguration = {}) {
  if (jobConfiguration.enabled === false) {
    logger.warn('EMAIL_QUEUE disabled by config');
    return;
  }

  queue = new Queue(baseService.QUEUES.EMAIL_QUEUE, baseService.getDefaultQueueOptions());

  queue.on('error', (err) => {
    logger.error('EMAIL_QUEUE runtime error', { message: err.message });
  });

  initWorkerIfEnabled(jobConfiguration);
}

async function stop() {
  await stopWorkerIfEnabled();
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}

module.exports = {
  init,
  stop,
  queue: ensureQueue,
  scheduleSendEmailJob,
};
