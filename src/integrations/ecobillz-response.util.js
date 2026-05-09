const AppError = require('../utils/app-error');

function assertEcobillzEnvelope(body) {
  if (body && typeof body === 'object' && body.error === true) {
    throw new AppError(body.message || body.msg || 'Ecobillz upstream reported error', 502, {
      code: 'ECOBILLZ_UPSTREAM',
    });
  }
}

/** Reads Ecobillz `{ error, result }` plus legacy array / `data` shapes. */
function ecobillzResultArray(body) {
  assertEcobillzEnvelope(body);
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.result)) return body.result;
  if (body.result != null && typeof body.result === 'object') return [body.result];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.data)) return body.data;
  return [];
}

module.exports = {
  assertEcobillzEnvelope,
  ecobillzResultArray,
};
