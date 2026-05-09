const os = require('os');
const logger = require('../../utils/logger');

const QUEUES = {
  SCHEDULE_AR_PROCESSING: 'ar-processing',
  SCHEDULE_PDF_CREATION: 'pdf-creation',
};

/**
 * @returns {import('bullmq').ConnectionOptions}
 */
function getQueueConnection() {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}

function getQueuePrefix() {
  return process.env.REDIS_QUEUE_PREFIX || undefined;
}

/**
 * @returns {import('bullmq').QueueOptions}
 */
function getDefaultQueueOptions() {
  return {
    connection: getQueueConnection(),
    prefix: getQueuePrefix(),
  };
}

/**
 * @returns {import('bullmq').WorkerOptions}
 */
function getDefaultWorkerOptions() {
  return {
    connection: getQueueConnection(),
    prefix: getQueuePrefix(),
    name: `${os.hostname()}-${process.pid}`,
  };
}

function isWorkerEnabled(queueName) {
  if (process.env.DISABLE_WORKERS === 'true') {
    return false;
  }
  const flag = process.env[`WORKER_${queueName.replace(/-/g, '_').toUpperCase()}_ENABLED`];
  if (flag === 'false') {
    return false;
  }
  logger.info('Worker enabled', { queue: queueName });
  return true;
}

module.exports = {
  QUEUES,
  getQueueConnection,
  getQueuePrefix,
  getDefaultQueueOptions,
  getDefaultWorkerOptions,
  isWorkerEnabled,
};
