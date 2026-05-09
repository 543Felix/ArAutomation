const bcrypt = require('bcryptjs');
const { signAccessToken } = require('../../config/jwt');
const { USER_ERRORS } = require('../user/user.constants');
const AppError = require('../../utils/app-error');
const { userRepository } = require('../../data/repositories');

const SALT_ROUNDS = 12;

async function register({ email, password, name }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError(USER_ERRORS.EMAIL_IN_USE, 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepository.create({ email, passwordHash, name: name || '' });

  const token = signAccessToken({ sub: user.id });
  return { user, token };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmailWithPasswordHash(email);
  if (!user) {
    throw new AppError(USER_ERRORS.INVALID_CREDENTIALS, 401);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AppError(USER_ERRORS.INVALID_CREDENTIALS, 401);
  }

  user.passwordHash = undefined;
  const token = signAccessToken({ sub: user.id });
  return { user, token };
}

module.exports = {
  register,
  login,
};
