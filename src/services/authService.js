const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signAccessToken } = require('../config/jwt');
const { USER_ERRORS } = require('../constants/users');
const AppError = require('../utils/AppError');

const SALT_ROUNDS = 12;

async function register({ email, password, name }) {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError(USER_ERRORS.EMAIL_IN_USE, 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ email, passwordHash, name: name || '' });

  const token = signAccessToken({ sub: user.id });
  return { user, token };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email }).select('+passwordHash');
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
