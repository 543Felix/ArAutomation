const { Worker, UnrecoverableError } = require('bullmq');
const logger = require('../../../utils/logger');
const baseService = require('../jobs-base.service');
const pdfService = require('../../document/pdf.service');
const { PDF_JOB_NAMES } = require('../../ar/ar.constants');

/** @type {import('bullmq').Worker | undefined} */
let worker;

async function jobHandler(job) {
  logger.info('PDF worker received job', {
    queue: worker?.qualifiedName,
    name: job.name,
    id: job.id,
  });

  if (job.name !== PDF_JOB_NAMES.CREATE) {
    throw new UnrecoverableError(`Unknown PDF job name: ${job.name}`);
  }

  const raw = job.data || {};
  const ids =
    Array.isArray(raw.arEntryIds) && raw.arEntryIds.length > 0
      ? [...new Set(raw.arEntryIds.map(String).filter(Boolean))]
      : raw.arEntryId != null && String(raw.arEntryId).trim()
        ? [String(raw.arEntryId).trim()]
        : [];
  if (!ids.length) {
    throw new UnrecoverableError('arEntryIds (or legacy arEntryId) required for PDF_CREATION_JOB');
  }

  try {
    return await pdfService.generateAndAttachPdf(ids);
  } catch (err) {
    logger.error('PDF worker job failed', {
      queue: worker?.qualifiedName,
      jobId: job.id,
      arEntryIds: ids,
      error: logger.serializeError(err),
    });
    throw err;
  }
}

function initWorkerIfEnabled(jobConfiguration = {}) {
  if (!baseService.isWorkerEnabled(baseService.QUEUES.SCHEDULE_PDF_CREATION)) {
    return;
  }

  worker = new Worker(
    baseService.QUEUES.SCHEDULE_PDF_CREATION,
    jobHandler,
    {
      ...baseService.getDefaultWorkerOptions(),
      concurrency: jobConfiguration.workerConcurrency || 1,
      autorun: false,
    },
  );

  worker.on('completed', (job, result) => {
    logger.info('PDF job completed', { jobId: job.id, result });
  });

  worker.on('failed', (job, error) => {
    logger.error('PDF job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: logger.serializeError(error),
    });
  });

  worker.on('error', (err) => {
    logger.error('PDF worker runtime error', { error: logger.serializeError(err) });
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
