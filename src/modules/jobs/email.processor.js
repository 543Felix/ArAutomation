const { Worker, UnrecoverableError } = require('bullmq');
const logger = require('../../utils/logger');
const baseService = require('./jobs-base.service');
const emailModule = require('../email/email.service');
const { EMAIL_JOB_NAMES } = require('../ar/ar.constants');

/** @type {import('bullmq').Worker | undefined} */
let worker;

async function jobHandler(job) {
  logger.info('Email worker received job', {
    queue: worker?.qualifiedName,
    name: job.name,
    id: job.id,
  });

  if (job.name !== EMAIL_JOB_NAMES.SEND) {
    throw new UnrecoverableError(`Unknown email job name: ${job.name}`);
  }

  try {
    return await emailModule.sendInvoiceEmail(job.data || {});
  } catch (err) {
    if (err instanceof emailModule.FatalEmailJobError) {
      logger.error('Email job fatal — will not retry', {
        code: err.code,
        message: err.message,
      });
      throw new UnrecoverableError(err.message);
    }
    logger.error('Email job failed (may retry)', { error: logger.serializeError(err) });
    throw err;
  }
}

function initWorkerIfEnabled(jobConfiguration = {}) {
  if (!baseService.isWorkerEnabled(baseService.QUEUES.EMAIL_QUEUE)) {
    return;
  }

  worker = new Worker(
    baseService.QUEUES.EMAIL_QUEUE,
    jobHandler,
    {
      ...baseService.getDefaultWorkerOptions(),
      concurrency: jobConfiguration.workerConcurrency || 2,
      autorun: false,
    },
  );

  worker.on('completed', (job, result) => {
    logger.info('Email job completed', { jobId: job.id, result });
  });

  worker.on('failed', (job, error) => {
    logger.error('Email job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: logger.serializeError(error),
    });
  });

  worker.on('error', (err) => {
    logger.error('Email worker runtime error', { error: logger.serializeError(err) });
  });

  worker.run();
}

async function stopWorkerIfEnabled() {
  if (!worker) return;
  await worker.close();
  worker = undefined;
}

module.exports = {
  jobHandler,
  initWorkerIfEnabled,
  stopWorkerIfEnabled,
};
