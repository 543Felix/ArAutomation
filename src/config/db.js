const mongoose = require('mongoose');
const logger = require('../utils/logger');

function redactMongoUri(uri) {
  return String(uri).replace(/:\/\/([^:/?#]+):([^@]+)@/, '://$1:***@');
}

async function connectDb() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
    });
  } catch (err) {
    logger.error('MongoDB connection failed', {
      mongoUri: redactMongoUri(uri),
      error: logger.serializeError(err),
    });
    throw err;
  }

  return mongoose.connection;
}

module.exports = { connectDb };
