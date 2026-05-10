const { companyPdfBundleKey } = require('./ar-bundle-key.util');

/**
 * Mongo filter: same merchant/outlet + corporate bucket (`billingIdentifier`, else `companyName`).
 * When `guestId` is set on the anchor, scope is narrowed to that guest within the bucket.
 * When both identifier and company name are empty, scope collapses to the anchor `_id` only.
 */
function customerGroupFilterFromEntry(entry) {
  if (!entry) return null;

  const merchantId = entry.merchantId;
  const outletId = entry.outletId;

  const ident =
    entry.billingIdentifier != null && String(entry.billingIdentifier).trim() !== ''
      ? String(entry.billingIdentifier).trim()
      : null;
  const companyName =
    entry.companyName != null && String(entry.companyName).trim() !== ''
      ? String(entry.companyName).trim()
      : null;
  const guestId =
    entry.guestId != null && String(entry.guestId).trim() !== ''
      ? String(entry.guestId).trim()
      : null;

  const filter = { merchantId, outletId };

  if (ident) {
    filter.billingIdentifier = ident;
  } else if (companyName) {
    filter.companyName = companyName;
  } else {
    return { _id: entry._id };
  }

  if (guestId) {
    filter.guestId = guestId;
  }

  return filter;
}

function customerScopeSummary(entry, entryIds = []) {
  if (!entry) {
    return {
      bundleKey: '',
      billingIdentifier: '',
      companyName: '',
      guestId: '',
      arEntryIds: entryIds.map(String),
      arEntryCount: entryIds.length,
    };
  }
  return {
    bundleKey: companyPdfBundleKey(entry),
    billingIdentifier:
      entry.billingIdentifier != null ? String(entry.billingIdentifier).trim() : '',
    companyName: entry.companyName != null ? String(entry.companyName).trim() : '',
    guestId: entry.guestId != null ? String(entry.guestId).trim() : '',
    arEntryIds: entryIds.map(String),
    arEntryCount: entryIds.length,
  };
}

module.exports = {
  customerGroupFilterFromEntry,
  customerScopeSummary,
};
