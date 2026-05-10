const { companyRepository } = require('../../data/repositories');
const AppError = require('../../utils/app-error');
const { toObjectId } = require('../../data/mongo/object-id.util');

function isDuplicateKeyError(err) {
  return err && err.code === 11000;
}

function listPatchKeys() {
  return [
    'name',
    'email',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'country',
    'pincode',
    'phone',
    'website',
    'taxId',
    'notes',
  ];
}

async function createCompany(payload) {
  try {
    return await companyRepository.create(payload);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('Company name already exists', 409, { code: 'DUPLICATE' });
    }
    throw err;
  }
}

async function getCompany(id) {
  const oid = toObjectId(id);
  if (!oid) throw new AppError('Invalid company id', 400);
  const doc = await companyRepository.findById(oid);
  if (!doc) throw new AppError('Company not found', 404);
  return doc;
}

async function listCompanies({ page = 1, limit = 20, q }) {
  const filter = {};
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { city: rx }];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const lim = Math.min(100, Math.max(1, Number(limit)));

  const [companies, total] = await Promise.all([
    companyRepository.findPage(filter, skip, lim),
    companyRepository.count(filter),
  ]);

  return { companies, total, page: Number(page), limit: lim };
}

async function updateCompany(id, body) {
  const oid = toObjectId(id);
  if (!oid) throw new AppError('Invalid company id', 400);

  const patch = {};
  for (const k of listPatchKeys()) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    throw new AppError('No updatable fields provided', 400);
  }

  try {
    const updated = await companyRepository.updateById(oid, patch);
    if (!updated) throw new AppError('Company not found', 404);
    return updated;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('Company name already exists', 409, { code: 'DUPLICATE' });
    }
    throw err;
  }
}

async function deleteCompany(id) {
  const oid = toObjectId(id);
  if (!oid) throw new AppError('Invalid company id', 400);
  const ok = await companyRepository.deleteById(oid);
  if (!ok) throw new AppError('Company not found', 404);
  return { deleted: true, id: String(oid) };
}

module.exports = {
  createCompany,
  getCompany,
  listCompanies,
  updateCompany,
  deleteCompany,
};
