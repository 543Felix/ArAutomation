/**
 * Persistence gateway: swap implementations via DB_DRIVER for PostgreSQL/SQL later.
 * Only MongoDB is implemented today.
 */
const driver = (process.env.DB_DRIVER || 'mongo').toLowerCase();

if (driver !== 'mongo') {
  throw new Error(
    `DB_DRIVER="${driver}" is not implemented. Supported: mongo. ` +
      'Add a postgres adapter under src/data/postgres/ and wire it here.',
  );
}

module.exports = {
  driver,
  userRepository: require('../mongo/user.mongo.repository'),
  arEntryRepository: require('../mongo/ar-entry.mongo.repository'),
  invoiceRepository: require('../mongo/invoice.mongo.repository'),
  checkRepository: require('../mongo/check.mongo.repository'),
  pdfDocumentRepository: require('../mongo/pdf-document.mongo.repository'),
};
