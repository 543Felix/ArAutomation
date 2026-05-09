const userService = require('./user.service');
const asyncHandler = require('../../utils/async-handler');

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  res.json({ user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  res.json({ user });
});

const list = asyncHandler(async (_req, res) => {
  const users = await userService.listUsers();
  res.json({ users });
});

module.exports = {
  getMe,
  updateMe,
  list,
};
