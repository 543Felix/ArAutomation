#!/usr/bin/env node
/**
 * Local test for AR cover-letter text + optional PDF (OpenAI refinement when configured).
 *
 * Usage (from repo root):
 *   npm run test:cover-letter
 *   npm run test:cover-letter -- --pdf /tmp/cover-test.pdf
 *
 * Requires in .env:
 *   OPENAI_API_KEY=sk-...
 *   AI_COVER_LETTER_ENABLED=true   (omit or set false to test template-only fallback)
 *
 * Optional: OPENAI_MODEL, OPENAI_BASE_URL (defaults in openai.client.js)
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs/promises');

const SAMPLE = {
  currentDate: new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
  customerNo: 'CS5002000022',
  companyName: 'ECOBILLZ',
  companyAddrLine1: '12 MG Road',
  companyAddrLine2: 'Floor 3',
  companyAddrLine3: '',
  companyAddrLine4: 'Bengaluru',
  companyPincode: '560001',
  addressedTo: 'Accounts — Corporate Stay',
  total: '5,200.50',
  outletName: 'ITC Gardenia',
  outletAddress1: '1, Residency Road',
  outletAddress2: 'Ashok Nagar',
  outletState: 'Karnataka',
  outletCity: 'Bengaluru',
  outletBankName: 'HDFC Bank',
  outletBankIFSC: 'HDFC0001234',
  outletBankAccountPrefix: '50100-',
  outletPan: 'AAACI1234B',
  outletGstin: '29AAACI1234B1Z5',
  missingDocuments: ['Cheque scan for CS5002000028'],
};

async function main() {
  const pdfIdx = process.argv.indexOf('--pdf');
  const wantsPdf = pdfIdx >= 0;
  const pdfArg = wantsPdf ? process.argv[pdfIdx + 1] : null;
  const outPath = wantsPdf
    ? pdfArg && !pdfArg.startsWith('-')
      ? path.resolve(pdfArg)
      : path.join(process.cwd(), 'scripts', 'cover-letter-test.pdf')
    : null;

  const { generateCoverLetter, SOURCE } = require('../src/modules/ai/ai.service');

  console.log('--- OpenAI config ---');
  console.log('OPENAI_API_KEY set:', Boolean(process.env.OPENAI_API_KEY?.trim()));
  console.log('AI_COVER_LETTER_ENABLED:', process.env.AI_COVER_LETTER_ENABLED ?? '(default true)');
  console.log('OPENAI_MODEL:', process.env.OPENAI_MODEL || 'gpt-4o-mini');
  console.log('');

  const result = await generateCoverLetter(SAMPLE);

  console.log('--- Result ---');
  console.log('source:', result.source, result.source === SOURCE.AI ? '(OpenAI refined)' : '(template fallback)');
  console.log('missingPlaceholders:', result.missingPlaceholders);
  console.log('');
  console.log('--- coverLetterText ---');
  console.log(result.coverLetterText);
  console.log('--- end ---');

  if (outPath) {
    const { buildAiCoverLetter } = require('../src/modules/document/pdf.service');
    const { buffer } = await buildAiCoverLetter(SAMPLE);
    await fs.writeFile(outPath, buffer);
    console.log('');
    console.log('PDF written:', outPath, `(${buffer.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
