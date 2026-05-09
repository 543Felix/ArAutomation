const Check = require('../../modules/check/check.model');
const { buildCheckMatchQuery } = require('../../modules/ar/ar.matcher');

async function findByCheckNumbers({ checkNos, merchantId, outletId }) {
  if (!Array.isArray(checkNos) || checkNos.length === 0) return [];
  const query = {
    ...buildCheckMatchQuery({ checkNo: { $in: checkNos }, merchantId, outletId }),
    checkNo: { $in: checkNos },
  };
  return Check.find(query).lean();
}

async function findByInvoice({ invoiceNo, merchantId, outletId }) {
  return Check.find({ invoiceNo, merchantId, outletId }).lean();
}

module.exports = {
  findByCheckNumbers,
  findByInvoice,
};
