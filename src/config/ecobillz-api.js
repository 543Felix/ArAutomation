/** Ecobillz upstream REST API: `ECOBILLZ_API_BASE_URL` plus `paths` route segments. */

function trimTrailingSlashes(s) {
  return s.replace(/\/+$/, '');
}

function getEcobillzBaseUrl() {
  const raw = process.env.ECOBILLZ_API_BASE_URL;
  return raw && String(raw).trim() ? trimTrailingSlashes(String(raw).trim()) : '';
}

/** Leading-slash paths; override per deployment if routes differ. */
const paths = {
  get AR_POSTED_ENTRIES() {
    return process.env.ECOBILLZ_AR_POSTED_ENTRIES_PATH || '/ar-posted-entries';
  },
  get INVOICES() {
    return process.env.ECOBILLZ_INVOICES_PATH || '/invoices';
  },
  get GET_CHEQUES() {
    return process.env.ECOBILLZ_GET_CHEQUES_PATH || '/get-cheques';
  },
};

/**
 * @param {string} routePath e.g. '/invoices'
 * @returns {string|null} full URL or null if base is unset
 */
function ecobillzUrl(routePath) {
  const base = getEcobillzBaseUrl();
  if (!base) return null;
  const p = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${base}${p}`;
}

function trimEnv(val) {
  const s = val != null ? String(val).trim() : '';
  return s || '';
}

/** Defaults for outbound Ecobillz calls when query/body omits IDs */
function getEcobillzMerchantId() {
  return trimEnv(process.env.ECOBILLZ_MERCHANT_ID);
}

function getEcobillzOutletId() {
  return trimEnv(process.env.ECOBILLZ_OUTLET_ID);
}

module.exports = {
  getEcobillzBaseUrl,
  getEcobillzMerchantId,
  getEcobillzOutletId,
  paths,
  ecobillzUrl,
};
