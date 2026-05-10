/**
 * Cover-letter prompt assets.
 *
 * Layer responsibility:
 *   - Owns the LITERAL letter template (single source of truth).
 *   - Owns the LLM system / user prompt strings.
 *   - Performs no I/O and no AI calls — pure functions only.
 *
 * Adding new placeholders: extend `MANDATORY_PLACEHOLDERS` and `DEFAULTS`.
 */

const MANDATORY_PLACEHOLDERS = [
  'currentDate',
  'customerNo',
  'companyName',
  'companyAddrLine1',
  'companyAddrLine2',
  'companyAddrLine3',
  'companyAddrLine4',
  'companyPincode',
  'addressedTo',
  'total',
  'outletName',
  'outletAddress1',
  'outletAddress2',
  'outletState',
  'outletBankName',
  'outletBankIFSC',
  'outletBankAccountPrefix',
  'outletPan',
  'outletGstin',
];

/** Optional placeholders rendered by deterministic code (not by the model). */
const OPTIONAL_PLACEHOLDERS = ['outletCity'];

/** Default values used when a placeholder is missing, so the letter never breaks. */
const DEFAULTS = Object.freeze({
  outletCity: 'Delhi',
});

const COVER_LETTER_TEMPLATE = `Date: {currentDate}

Account No : {customerNo}
{companyName}
{companyAddrLine1}
{companyAddrLine2}
{companyAddrLine3}
{companyAddrLine4} - {companyPincode}

Dear Sir / Madam

Kind Attn: {addressedTo}

We enclose herewith the bill(s) raised towards the services provided to your guests from our organization as per the details attached.
We would appreciate it if you could make the payment of Rs. {total}

Cheques/Drafts may be drawn in favour of ITC Ltd - {outletName} and send it to us at the business address given herein.
{outletName},{outletAddress1}, {outletAddress2},{outletState}

You may also remit through NEFT / RTGS in the following Bank A/c.

Bank: {outletBankName}\t\tIFSC / Swift Code: {outletBankIFSC}.  Account No.: {outletBankAccountPrefix}{customerNo}

Kindly provide your Permanent Account Number (PAN) as required under rule 114B of the Income Tax Rules, 1962, along with your payment remittance. Please send the remittance details to the Credit Manager along with the details of TDS.

Thank you for your cooperation and assistance.

Yours sincerely
For {outletCity}

CREDIT MANAGER

Kindly note:

1. Payment of this bill is due as per the agreed terms.
2. Discrepancies should be reported within 3 days.
3. Quote Account / Bill No while making payment.
4. PAN & GSTIN are {outletPan} & {outletGstin} respectively.`;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeholderValue(data, key) {
  const v = data[key];
  if (v === undefined || v === null) {
    return DEFAULTS[key] !== undefined ? DEFAULTS[key] : '';
  }
  return typeof v === 'string' ? v : String(v);
}

/**
 * Renders the template by substituting all placeholders.
 * Missing fields render as empty (or as their declared default), and runs of
 * blank lines are collapsed so an empty optional address line does not produce
 * a visually broken paragraph.
 */
function renderTemplate(data = {}) {
  const allKeys = [...MANDATORY_PLACEHOLDERS, ...OPTIONAL_PLACEHOLDERS];
  let output = COVER_LETTER_TEMPLATE;
  for (const key of allKeys) {
    const re = new RegExp(escapeRegExp(`{${key}}`), 'g');
    output = output.replace(re, placeholderValue(data, key));
  }
  return collapseWhitespace(output);
}

function collapseWhitespace(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Returns the list of placeholders not provided in `data` (excluding
 * placeholders that resolve via `DEFAULTS`).
 */
function findMissingPlaceholders(data = {}) {
  return MANDATORY_PLACEHOLDERS.filter((k) => {
    const v = data[k];
    return v === undefined || v === null || v === '';
  });
}

const SYSTEM_PROMPT = [
  'You are a meticulous business-correspondence editor for an Accounts Receivable cover letter.',
  '',
  'STRICT RULES (do not violate):',
  '1. Treat the letter you receive as the AUTHORITATIVE structure. Do NOT add, remove, reorder, or rename sections, headings, salutations, or sign-off lines.',
  '2. Do NOT change financial figures, account numbers, IFSC, bank names, GSTIN, PAN, dates, addresses, or any numeric / legal data.',
  '3. Do NOT introduce new claims, terms, deadlines, links, or contact information.',
  '4. You may only:',
  '   - Fix grammar, spelling, and minor punctuation.',
  '   - Smooth tone to be polite and professional.',
  '   - If the user supplies a "Missing documents" note, insert ONE short, polite paragraph requesting those documents, placed immediately BEFORE the "Thank you for your cooperation" line. Do not invent documents not listed.',
  '5. Preserve every line of the "Kindly note" numbered list verbatim.',
  '6. Output ONLY the final letter text. No markdown, no code fences, no commentary, no JSON.',
].join('\n');

function buildUserPrompt({ renderedLetter, missingDocuments }) {
  const parts = [
    'Refine the letter below according to the system rules.',
    '',
    'LETTER START',
    renderedLetter,
    'LETTER END',
  ];

  const docs = Array.isArray(missingDocuments)
    ? missingDocuments.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim())
    : [];

  if (docs.length) {
    parts.push(
      '',
      'Missing documents to mention politely (insert exactly one short paragraph, do not bullet-list):',
      ...docs.map((d) => `- ${d}`),
    );
  } else {
    parts.push('', 'No missing documents to mention.');
  }

  return parts.join('\n');
}

module.exports = {
  COVER_LETTER_TEMPLATE,
  MANDATORY_PLACEHOLDERS,
  OPTIONAL_PLACEHOLDERS,
  DEFAULTS,
  SYSTEM_PROMPT,
  renderTemplate,
  findMissingPlaceholders,
  buildUserPrompt,
};
