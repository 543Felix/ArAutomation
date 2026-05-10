const logger = require('../../utils/logger');
const { scheduleSendEmailJob } = require('../../queues/email.queue');
const { companyRepository } = require('../../data/repositories');

function extractCustomerEmail(entry) {
  const c = entry?.customer;
  if (c && typeof c === 'object') {
    const em = c.email || c.Email || c.mail || c.primaryEmail;
    if (em && String(em).trim()) return String(em).trim();
  }
  return '';
}

/**
 * Match `Company.name` to AR `companyName`, then `billingIdentifier` (unique candidates only).
 */
async function resolveCompanyRecipientEmail(entry) {
  const candidates = [];
  if (entry.companyName != null && String(entry.companyName).trim()) {
    candidates.push(String(entry.companyName).trim());
  }
  if (entry.billingIdentifier != null && String(entry.billingIdentifier).trim()) {
    const id = String(entry.billingIdentifier).trim();
    if (!candidates.some((c) => c.toLowerCase() === id.toLowerCase())) {
      candidates.push(id);
    }
  }

  for (const name of candidates) {
    try {
      const company = await companyRepository.findOneByNameCaseInsensitive(name);
      if (company?.email && String(company.email).trim()) {
        logger.info('[email-job] recipient resolved from Company collection', {
          matchedName: company.name,
          companyId: company._id?.toString?.(),
        });
        return String(company.email).trim();
      }
    } catch (err) {
      logger.warn('[email-job] company lookup failed', {
        name,
        message: err.message,
      });
    }
  }
  return '';
}

async function buildEmailJobPayloadFromEntries(entries, finalPdfUrl) {
  const sorted = [...entries].sort((a, b) =>
    String(a.invoiceNo).localeCompare(String(b.invoiceNo), undefined, { numeric: true }),
  );
  const primary = sorted[0];
  const arEntryIds = sorted.map((e) => String(e._id));
  const invoiceNos = sorted.map((e) => String(e.invoiceNo));

  const companyEmail = await resolveCompanyRecipientEmail(primary);
  const customerEmail =
    companyEmail ||
    extractCustomerEmail(primary) ||
    (process.env.AR_COLLECTION_EMAIL_DEFAULT_TO || '').trim() ||
    (process.env.COLLECTION_EMAIL_DEFAULT_TO || '').trim();

  const companyName =
    (primary.companyName && String(primary.companyName).trim()) ||
    (primary.billingIdentifier && String(primary.billingIdentifier).trim()) ||
    '';

  const businessDateRaw = primary.businessDate != null ? new Date(primary.businessDate) : null;
  const businessDate =
    businessDateRaw && !Number.isNaN(businessDateRaw.getTime())
      ? businessDateRaw.toISOString().slice(0, 10)
      : '';

  const amount = sorted.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const missingDocuments = [];
  for (const e of sorted) {
    if (Array.isArray(e.missingCheckNos)) {
      for (const no of e.missingCheckNos) {
        missingDocuments.push(`Supporting document for cheque no. ${no}`);
      }
    }
  }

  const dueSource = primary.departureDate || primary.invoiceDate || primary.businessDate;
  const dueDate = dueSource ? new Date(dueSource).toISOString().slice(0, 10) : '';

  return {
    arId: String(primary._id),
    arEntryIds,
    invoiceNo: invoiceNos.join(', '),
    invoiceNos,
    customerEmail,
    /** @deprecated use companyName — kept for older payloads */
    customerName: companyName,
    companyName,
    businessDate,
    amount,
    dueDate,
    finalPdfUrl: String(finalPdfUrl || '').trim(),
    missingDocuments: [...new Set(missingDocuments)],
  };
}

async function resolveRecipientEmailForArEntry(entry) {
  if (!entry) return '';
  const companyEmail = await resolveCompanyRecipientEmail(entry);
  return (
    companyEmail ||
    extractCustomerEmail(entry) ||
    (process.env.AR_COLLECTION_EMAIL_DEFAULT_TO || '').trim() ||
    (process.env.COLLECTION_EMAIL_DEFAULT_TO || '').trim() ||
    ''
  );
}

/**
 * After merged PDF is saved — enqueue collection email when recipient is known.
 * @returns {Promise<string|null>} job id or null when skipped
 */
async function scheduleSendEmailAfterPdf(entries, finalPdfUrl) {
  if (process.env.AUTO_EMAIL_ON_PDF_GENERATED === 'false') {
    logger.info('[email-job] AUTO_EMAIL_ON_PDF_GENERATED=false — skip enqueue');
    return null;
  }

  const payload = await buildEmailJobPayloadFromEntries(entries, finalPdfUrl);

  if (!payload.customerEmail) {
    logger.warn(
      '[email-job] Skip enqueue — no recipient (Company.name match for companyName/billingIdentifier, customer.email, or AR_COLLECTION_EMAIL_DEFAULT_TO)',
    );
    return null;
  }

  return scheduleSendEmailJob(payload);
}

module.exports = {
  buildEmailJobPayloadFromEntries,
  scheduleSendEmailJob,
  scheduleSendEmailAfterPdf,
  resolveRecipientEmailForArEntry,
};
