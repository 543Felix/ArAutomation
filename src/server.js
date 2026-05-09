require('dotenv').config();

const { createApp } = require('./app');
const { connectDb } = require('./config/db');
const jobsService = require('./modules/jobs/jobs.service');
const logger = require('./utils/logger');
const { API_BASE_PATH } = require('./config/api-constants');

const port = Number(process.env.PORT) || 3000;

async function start() {
  await connectDb();

  const app = await createApp({
    beforeRoutes: async (instance) => {
      try {
        await jobsService.init(instance);
      } catch (err) {
        logger.error('Job service init failed', { error: logger.serializeError(err) });
      }
    },
  });

  const server = app.listen(port, () => {
    logger.info('Server listening', {
      port,
      apiBasePath: API_BASE_PATH,
      hint: `curl http://localhost:${port}/  then login at POST http://localhost:${port}${API_BASE_PATH}/auth/login`,
    });
  });

  async function shutdown(signal) {
    logger.warn(`Received ${signal}, shutting down`);
    try {
      await jobsService.stop();
    } catch (err) {
      logger.error('Job service stop failed', { message: err.message });
    }
    server.close(() => process.exit(0));
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Failed to start server', { error: logger.serializeError(err) });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: logger.serializeError(reason),
  });
});
