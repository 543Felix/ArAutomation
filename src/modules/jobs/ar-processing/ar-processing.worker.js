const { Worker, UnrecoverableError } = require('bullmq');
const logger = require('../../../utils/logger');
const baseService = require('../jobs-base.service');
const arService = require('../../ar/ar.service');
const { AR_JOB_NAMES } = require('../../ar/ar.constants');

/** @type {import('bullmq').Worker | undefined} */
let worker;

const AR_JOB_TYPES = Object.values(AR_JOB_NAMES);

async function jobHandler(job) {
  logger.info('AR worker received job', {
    queue: worker?.qualifiedName,
    name: job.name,
    id: job.id,
  });

  try {
    switch (job.name) {
      case AR_JOB_NAMES.DAILY:
        return await arService.runDaily(job.data || {});
      case AR_JOB_NAMES.PROCESS_TARGET:
        return await arService.processForTarget(job.data || {});
      default:
        throw new UnrecoverableError(`Unknown AR job name: ${job.name}`);
    }
  } catch (err) {
    logger.error('AR worker job failed', {
      queue: worker?.qualifiedName,
      jobName: job.name,
      jobId: job.id,
      error: logger.serializeError(err),
    });
    throw err;
  }
}

function initWorkerIfEnabled(jobConfiguration = {}) {
  if (!baseService.isWorkerEnabled(baseService.QUEUES.SCHEDULE_AR_PROCESSING)) {
    return;
  }

  worker = new Worker(
    baseService.QUEUES.SCHEDULE_AR_PROCESSING,
    jobHandler,
    {
      ...baseService.getDefaultWorkerOptions(),
      concurrency: jobConfiguration.workerConcurrency || 1,
      autorun: false,
    },
  );

  worker.on('completed', (job, result) => {
    logger.info('AR job completed', { jobId: job.id, result });
  });

  worker.on('failed', (job, error) => {
    logger.error('AR job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: logger.serializeError(error),
    });
  });

  worker.on('error', (err) => {
    logger.error('AR worker runtime error', { error: logger.serializeError(err) });
  });

  worker.run();
}

async function stopWorkerIfEnabled() {
  if (!worker) return;
  await worker.close();
  worker = undefined;
}

module.exports = {
  AR_JOB_TYPES,
  jobHandler,
  initWorkerIfEnabled,
  stopWorkerIfEnabled,
};
