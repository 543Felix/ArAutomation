const Company = require('../../modules/company/company.model');

async function create(data) {
  return Company.create(data);
}

async function findById(id) {
  return Company.findById(id);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exact match on `name`, case-insensitive (trimmed). */
async function findOneByNameCaseInsensitive(name) {
  const raw = name != null ? String(name).trim() : '';
  if (!raw) return null;
  return Company.findOne({ name: new RegExp(`^${escapeRegex(raw)}$`, 'i') }).lean();
}

async function findPage(filter, skip, limit) {
  return Company.find(filter).sort({ name: 1 }).skip(skip).limit(limit);
}

async function count(filter) {
  return Company.countDocuments(filter);
}

async function updateById(id, patch) {
  return Company.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
}

async function deleteById(id) {
  const r = await Company.findByIdAndDelete(id);
  return Boolean(r);
}

module.exports = {
  create,
  findById,
  findOneByNameCaseInsensitive,
  findPage,
  count,
  updateById,
  deleteById,
};
