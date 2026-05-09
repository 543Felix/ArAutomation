const User = require('../models/User');
const { USER_ERRORS } = require('../constants/users');
const AppError = require('../utils/AppError');

async function getById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(USER_ERRORS.NOT_FOUND, 404);
  }
  return user;
}

async function updateProfile(userId, { name }) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(USER_ERRORS.NOT_FOUND, 404);
  }

  if (typeof name === 'string') {
    user.name = name.trim();
  }

  await user.save();
  return user;
}

async function listUsers() {
  return User.find().sort({ createdAt: -1 });
}

module.exports = {
  getById,
  updateProfile,
  listUsers,
};
