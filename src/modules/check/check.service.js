const { checkRepository } = require('../../data/repositories');

async function findChecksByNumbers(args) {
  return checkRepository.findByCheckNumbers(args);
}

async function findChecksForInvoice(args) {
  return checkRepository.findByInvoice(args);
}

module.exports = {
  findChecksByNumbers,
  findChecksForInvoice,
};
