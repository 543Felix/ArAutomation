const pkg = require('../../package.json');

const API_VERSION = 'v1';
const API_SEGMENT = `/api/${API_VERSION}`;
/** Base path for all versioned REST routes */
const API_BASE_PATH = API_SEGMENT;
/** Public URL prefix for files stored under STORAGE_DIR (not versioned) */
const FILES_PUBLIC_PREFIX = '/api/files';

module.exports = {
  API_VERSION,
  API_BASE_PATH,
  FILES_PUBLIC_PREFIX,
  SERVICE_NAME: pkg.name || 'arautomation',
  SERVICE_VERSION: pkg.version || '0.0.0',
};
