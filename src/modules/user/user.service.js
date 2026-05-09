const { USER_ERRORS } = require('./user.constants');
const AppError = require('../../utils/app-error');
const { userRepository } = require('../../data/repositories');

async function getById(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError(USER_ERRORS.NOT_FOUND, 404);
  }
  return user;
}

async function updateProfile(userId, { name }) {
  const user = await userRepository.updateNameById(userId, typeof name === 'string' ? name : '');
  if (!user) {
    throw new AppError(USER_ERRORS.NOT_FOUND, 404);
  }
  return user;
}

async function listUsers() {
  return userRepository.findAllSortedByCreatedDesc();
}

module.exports = {
  getById,
  updateProfile,
  listUsers,
};
