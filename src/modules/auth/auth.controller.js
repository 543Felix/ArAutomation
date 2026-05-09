const authService = require('./auth.service');
const asyncHandler = require('../../utils/async-handler');

const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  const { user, token } = await authService.register({ email, password, name });
  res.status(201).json({ user, token });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await authService.login({ email, password });
  res.json({ user, token });
});

module.exports = {
  register,
  login,
};
