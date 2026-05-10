/**
 * Stable grouping key for “one merged PDF per company”: same merchant/outlet
 * and same corporate identifier (billing code), falling back to company name.
 */
function companyPdfBundleKey(entry) {
  const mid = entry.merchantId?.toString?.() ?? String(entry.merchantId);
  const oid = entry.outletId?.toString?.() ?? String(entry.outletId);
  const ident =
    entry.billingIdentifier != null && String(entry.billingIdentifier).trim() !== ''
      ? String(entry.billingIdentifier).trim()
      : entry.companyName != null && String(entry.companyName).trim() !== ''
        ? String(entry.companyName).trim()
        : '__unknown__';
  return `${mid}|${oid}|${ident}`;
}

module.exports = {
  companyPdfBundleKey,
};
