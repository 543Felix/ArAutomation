const { verifyAccessToken } = require('../../config/jwt');
const { USER_ERRORS } = require('../user/user.constants');
const AppError = require('../../utils/app-error');

function authMiddleware(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(USER_ERRORS.UNAUTHORIZED, 401));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new AppError(USER_ERRORS.UNAUTHORIZED, 401));
  }

  try {
    const decoded = verifyAccessToken(token);
    const userId = decoded.sub;
    if (!userId) {
      return next(new AppError(USER_ERRORS.UNAUTHORIZED, 401));
    }
    req.user = { id: userId };
    next();
  } catch {
    next(new AppError(USER_ERRORS.UNAUTHORIZED, 401));
  }
}

module.exports = authMiddleware;
