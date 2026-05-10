const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const logger = require('../../utils/logger');
const arProcessingQueueService = require('./ar-processing/queue.service');
const pdfCreationQueueService = require('./pdf-creation/queue.service');
const emailQueueService = require('../../queues/email.queue');

const QUEUE_SERVICES = [
  arProcessingQueueService,
  pdfCreationQueueService,
  emailQueueService,
];

const defaultJobConfig = {
  enabled: true,
  workerConcurrency: 1,
  rateLimitJobMaxCount: 20,
  rateLimitJobMaxDurationSecs: 1,
};

function basicAuthGuard(req, res, next) {
  const username = process.env.BULL_BOARD_USERNAME;
  const password = process.env.BULL_BOARD_PASSWORD;

  if (!username || !password) {
    return next();
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="bull-board"');
    return res.status(401).send('Authentication required');
  }

  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const reqUser = decoded.slice(0, sep);
  const reqPass = decoded.slice(sep + 1);

  if (reqUser === username && reqPass === password) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="bull-board"');
  return res.status(401).send('Invalid credentials');
}

function buildBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  const basePath = process.env.BULL_BOARD_PATH || '/api/admin/queues';
  serverAdapter.setBasePath(basePath);

  const queues = QUEUE_SERVICES.map((svc) => {
    try {
      return new BullMQAdapter(svc.queue(), {
        readOnlyMode: process.env.BULL_BOARD_READ_ONLY === 'true',
      });
    } catch {
      return null;
    }
  }).filter(Boolean);

  createBullBoard({
    queues,
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'ArAutomation Queues',
      },
    },
  });

  return { router: serverAdapter.getRouter(), basePath };
}

async function init(app) {
  for (const svc of QUEUE_SERVICES) {
    await svc.init(defaultJobConfig);
  }

  const { router, basePath } = buildBullBoardRouter();
  app.use(basePath, basicAuthGuard, router);
  logger.info('Bull-Board mounted', { path: basePath });
}

async function stop() {
  for (const svc of QUEUE_SERVICES) {
    try {
      await svc.stop();
    } catch (err) {
      logger.warn('Queue stop failed', { message: err.message });
    }
  }
}

module.exports = {
  init,
  stop,
};
