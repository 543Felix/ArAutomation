const User = require('../../modules/user/user.model');

async function findByEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : email;
  return User.findOne({ email: normalized });
}

async function findByEmailWithPasswordHash(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : email;
  return User.findOne({ email: normalized }).select('+passwordHash');
}

async function create({ email, passwordHash, name }) {
  return User.create({
    email: typeof email === 'string' ? email.trim().toLowerCase() : email,
    passwordHash,
    name: name || '',
  });
}

async function findById(id) {
  return User.findById(id);
}

async function updateNameById(id, name) {
  return User.findOneAndUpdate(
    { _id: id },
    { $set: { name: String(name).trim() } },
    { new: true },
  );
}

async function findAllSortedByCreatedDesc() {
  return User.find().sort({ createdAt: -1 });
}

module.exports = {
  findByEmail,
  findByEmailWithPasswordHash,
  create,
  findById,
  updateNameById,
  findAllSortedByCreatedDesc,
};
