const companyService = require('./company.service');
const asyncHandler = require('../../utils/async-handler');

const create = asyncHandler(async (req, res) => {
  const company = await companyService.createCompany(req.body);
  res.status(201).json({ company });
});

const list = asyncHandler(async (req, res) => {
  const result = await companyService.listCompanies(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const company = await companyService.getCompany(req.params.id);
  res.json({ company });
});

const update = asyncHandler(async (req, res) => {
  const company = await companyService.updateCompany(req.params.id, req.body);
  res.json({ company });
});

const remove = asyncHandler(async (req, res) => {
  const result = await companyService.deleteCompany(req.params.id);
  res.json(result);
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
};
