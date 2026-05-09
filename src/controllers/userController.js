const userService = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');

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
