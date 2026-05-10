function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMissingDocsLine(docs) {
  if (!Array.isArray(docs) || !docs.length) return 'None.';
  return docs.map((d) => `- ${d}`).join('\n');
}

/**
 * @param {{
 *   invoiceNo: string,
 *   amount?: number|string,
 *   dueDate?: string,
 *   customerName?: string,
 *   companyName?: string,
 *   businessDate?: string,
 *   missingDocuments?: string[],
 * }} data
 */
function collectionEmailFallback(data = {}) {
  const invoiceLine = data.invoiceNo || '(invoice)';
  const amountLine = formatAmount(data.amount ?? '');
  const due = data.dueDate ? String(data.dueDate) : 'as per agreed terms';
  const company =
    (data.companyName != null && String(data.companyName).trim()) ||
    (data.customerName != null && String(data.customerName).trim()) ||
    '';
  const greetingName = company || 'Sir/Madam';
  const bizDate = data.businessDate != null ? String(data.businessDate).trim() : '';

  const missingBlock =
    Array.isArray(data.missingDocuments) && data.missingDocuments.length
      ? `\n\nWe still await the following documents:\n${formatMissingDocsLine(data.missingDocuments)}\nKindly share them at your earliest convenience.\n`
      : '\n';

  const subjectParts = ['Accounts receivable'];
  if (company) subjectParts.push(company);
  if (bizDate) subjectParts.push(bizDate);
  subjectParts.push(`Invoice ${invoiceLine}`);
  const subject = subjectParts.join(' — ');

  const body = `Dear ${greetingName},

Please find attached our consolidated statement PDF relating to invoice ${invoiceLine}.

Amount due: INR ${amountLine}
Due date: ${due}.${missingBlock}

Thank you for your prompt attention.

Regards,
Accounts Receivable`;

  return { subject, body };
}

module.exports = {
  collectionEmailFallback,
};
