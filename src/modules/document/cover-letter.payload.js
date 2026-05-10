/**
 * Maps AR job context + env into `ai.prompts` cover-letter input.
 * Outlet / bank / company lines come from env until synced from Ecobillz/CRM.
 */

function trimEnv(name, fallback = '') {
  const v = process.env[name];
  if (v == null || !String(v).trim()) return fallback;
  return String(v).trim();
}

function formatRupee(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLetterDate(d = new Date()) {
  const opts = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  const tz = process.env.COVER_LETTER_TIMEZONE;
  if (tz && String(tz).trim()) {
    opts.timeZone = String(tz).trim();
  }
  return d.toLocaleDateString('en-IN', opts);
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const na = String(a.entry?.invoiceNo ?? '');
    const nb = String(b.entry?.invoiceNo ?? '');
    const c = na.localeCompare(nb, undefined, { numeric: true });
    if (c !== 0) return c;
    return String(a.entry?._id ?? '').localeCompare(String(b.entry?._id ?? ''));
  });
}

/**
 * One cover letter for many AR rows (same company group): summed total,
 * merged missing-document hints, representative row for addresses / customer no.
 *
 * @param {{ entry: object, invoice: object|null, checks: object[] }[]} rows
 */
function buildCoverLetterGroupPayload(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('buildCoverLetterGroupPayload requires at least one row');
  }

  const sorted = sortRows(rows);
  const representative = sorted[0].entry;

  let totalAmount = 0;
  for (const r of sorted) {
    totalAmount += Number(r.invoice?.amount ?? r.entry?.amount) || 0;
  }
  const total = formatRupee(totalAmount);

  const customerNo =
    trimEnv('COVER_LETTER_CUSTOMER_NO') ||
    (representative.billingIdentifier != null && String(representative.billingIdentifier).trim()
      ? String(representative.billingIdentifier).trim()
      : representative.invoiceNo != null
        ? String(representative.invoiceNo)
        : '');

  const missingDocuments = [];

  for (const { entry, invoice, checks } of sorted) {
    if (Array.isArray(entry?.missingCheckNos) && entry.missingCheckNos.length) {
      for (const no of entry.missingCheckNos) {
        missingDocuments.push(`Supporting document for cheque no. ${no}`);
      }
    }

    for (const c of checks || []) {
      if (c?.checkNo && !c.pdfDocId) {
        missingDocuments.push(`Cheque image / scan for cheque no. ${c.checkNo}`);
      }
    }

    const hasInvoicePdf =
      (invoice?.pdfUrl && String(invoice.pdfUrl).trim()) ||
      (invoice?.pdfDocId && String(invoice.pdfDocId).trim());
    if (invoice && !hasInvoicePdf) {
      missingDocuments.push(`Tax invoice PDF copy (invoice ${entry.invoiceNo})`);
    }
  }

  const uniqueDocs = [...new Set(missingDocuments)];
  const outletCityVal = trimEnv('COVER_LETTER_OUTLET_CITY');

  const addr1 =
    trimEnv('COVER_LETTER_COMPANY_ADDR_LINE1') ||
    (representative?.customer &&
    typeof representative.customer === 'object' &&
    representative.customer.address1
      ? String(representative.customer.address1)
      : '');

  return {
    currentDate: formatLetterDate(),
    customerNo,
    companyName:
      trimEnv('COVER_LETTER_COMPANY_NAME') ||
      (representative?.companyName ? String(representative.companyName) : ''),
    companyAddrLine1: addr1,
    companyAddrLine2: trimEnv('COVER_LETTER_COMPANY_ADDR_LINE2'),
    companyAddrLine3: trimEnv('COVER_LETTER_COMPANY_ADDR_LINE3'),
    companyAddrLine4: trimEnv('COVER_LETTER_COMPANY_ADDR_LINE4'),
    companyPincode: trimEnv('COVER_LETTER_COMPANY_PINCODE'),
    addressedTo: trimEnv('COVER_LETTER_ADDRESSED_TO', 'Accounts Department'),
    total,
    outletName: trimEnv('COVER_LETTER_OUTLET_NAME'),
    outletAddress1: trimEnv('COVER_LETTER_OUTLET_ADDRESS1'),
    outletAddress2: trimEnv('COVER_LETTER_OUTLET_ADDRESS2'),
    outletState: trimEnv('COVER_LETTER_OUTLET_STATE'),
    outletBankName: trimEnv('COVER_LETTER_OUTLET_BANK_NAME'),
    outletBankIFSC: trimEnv('COVER_LETTER_OUTLET_BANK_IFSC'),
    outletBankAccountPrefix: trimEnv('COVER_LETTER_OUTLET_BANK_ACCOUNT_PREFIX'),
    outletPan: trimEnv('COVER_LETTER_OUTLET_PAN'),
    outletGstin: trimEnv('COVER_LETTER_OUTLET_GSTIN'),
    ...(outletCityVal ? { outletCity: outletCityVal } : {}),
    ...(uniqueDocs.length ? { missingDocuments: uniqueDocs } : {}),
  };
}

/**
 * @param {{ entry: object, invoice: object|null, checks: object[] }} ctx
 */
function buildCoverLetterJobPayload(ctx) {
  return buildCoverLetterGroupPayload([ctx]);
}

module.exports = {
  buildCoverLetterJobPayload,
  buildCoverLetterGroupPayload,
};
