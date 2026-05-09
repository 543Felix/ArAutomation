const mongoose = require('mongoose');

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(String(value));
  return null;
}

module.exports = {
  toObjectId,
};
