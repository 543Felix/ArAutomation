const logger = require('../../utils/logger');
const mailer = require('../../config/mailer');
const { arEntryRepository } = require('../../data/repositories');
const { toObjectId } = require('../../data/mongo/object-id.util');
const AppError = require('../../utils/app-error');
const emailJob = require('../jobs/email.job');
const emailReader = require('./email.reader.service');
const emailService = require('./email.service');

function extractEmail(text) {
  const raw = String(text || '');
  const bracket = raw.match(/<([^>\s]+@[^>\s]+)>/);
  if (bracket) return bracket[1].trim().toLowerCase();
  const bare = raw.match(/([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
  return bare ? bare[1].trim().toLowerCase() : '';
}

function normalizeSubjectForMatch(subject) {
  return String(subject || '')
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/gi, '')
    .trim();
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function haystackReferencesInvoice(haystack, invoiceNo) {
  const inv = String(invoiceNo || '').trim();
  if (!inv) return false;
  const h = normalizeForMatch(haystack);
  const invNorm = normalizeForMatch(inv);
  return h.includes(invNorm);
}

function subjectReferencesInvoice(subject, invoiceNo) {
  return haystackReferencesInvoice(normalizeSubjectForMatch(subject), invoiceNo);
}

function utcYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return { iso: `${y}-${m}-${day}`, y, m, day };
}

function dateVariantsForSubjectMatch(d) {
  const parts = utcYmd(d);
  if (!parts) return [];
  const { iso, y, m, day } = parts;
  const variants = new Set([
    iso,
    `${day}/${m}/${y}`,
    `${m}/${day}/${y}`,
    `${day}.${m}.${y}`,
    `${y}.${m}.${day}`,
  ]);
  return [...variants].map(normalizeForMatch);
}

function subjectMatchesCompanyAndBusinessDate(subject, entry) {
  const companyHint =
    String(entry.companyName || '').trim() || String(entry.billingIdentifier || '').trim();
  if (!companyHint) return false;

  const subNorm = normalizeForMatch(normalizeSubjectForMatch(subject));
  const companyNorm = normalizeForMatch(companyHint);
  if (!companyNorm || !subNorm.includes(companyNorm)) return false;

  const bd = entry.businessDate ?? entry.invoiceDate ?? entry.departureDate;
  const dateStrings = dateVariantsForSubjectMatch(bd);
  if (!dateStrings.length) return false;

  return dateStrings.some((ds) => ds && subNorm.includes(ds));
}

function normalizeMid(raw) {
  return String(raw || '')
    .replace(/^<|>$/g, '')
    .trim();
}

function collectAddressesFromHeaders(fromStr, toStr) {
  const hay = `${fromStr || ''} ${toStr || ''}`;
  const found = new Set();
  const re = /([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = re.exec(hay))) {
    found.add(m[1].toLowerCase());
  }
  return [...found];
}

function messageTouchesPeer(email, peerLower) {
  if (!peerLower) return false;
  return collectAddressesFromHeaders(email.from, email.to).some((a) => a === peerLower);
}

function matchesLastOutboundSubject(replySubject, lastSentSubject) {
  const root = normalizeForMatch(normalizeSubjectForMatch(String(lastSentSubject || '')));
  const cand = normalizeForMatch(normalizeSubjectForMatch(String(replySubject || '')));
  if (root.length < 10) return false;
  return cand.includes(root);
}

function peerAnchoredThreadEmail(email, entry, peerLower) {
  if (!peerLower || !messageTouchesPeer(email, peerLower)) return false;

  const sub = email.subject || '';
  const body = email.body || '';
  const inv = String(entry.invoiceNo || '').trim();
  const hay = `${sub}\n${body}`;

  if (inv.length > 0 && haystackReferencesInvoice(hay, inv)) return true;
  if (matchesLastOutboundSubject(sub, entry.lastEmailSubject)) return true;
  if (subjectMatchesCompanyAndBusinessDate(sub, entry)) return true;

  return false;
}

function expandThreadByInReplyTo(allEmails, seeds) {
  const collected = new Map(seeds.map((e) => [normalizeMid(e.messageId), { ...e }]));
  const anchor = new Set(collected.keys());

  let changed = true;
  while (changed) {
    changed = false;
    for (const e of allEmails) {
      const mid = normalizeMid(e.messageId);
      if (collected.has(mid)) continue;
      const irt = normalizeMid(e.inReplyTo || '');
      if (irt && anchor.has(irt)) {
        collected.set(mid, { ...e });
        anchor.add(mid);
        changed = true;
      }
    }
  }
  return [...collected.values()];
}

function emailBelongsToArEntry(email, entry, peerLower = '') {
  const sub = email.subject || '';
  const body = email.body || '';
  const inv = String(entry.invoiceNo || '').trim();

  if (inv.length > 0) {
    if (subjectReferencesInvoice(sub, inv) || haystackReferencesInvoice(body, inv)) {
      return true;
    }
  }

  if (subjectMatchesCompanyAndBusinessDate(sub, entry)) return true;

  const peer = String(peerLower || '').trim().toLowerCase();
  if (peer && peerAnchoredThreadEmail(email, entry, peer)) return true;

  return false;
}

function collectBusinessEmails() {
  const smtp = mailer.getSmtpConfig();
  const set = new Set();
  const a = extractEmail(smtp.from);
  const b = extractEmail(smtp.user);
  if (a) set.add(a);
  if (b) set.add(b);
  return [...set];
}

function resolveDirection(fromHeader, businessEmailsLowercased) {
  const hay = String(fromHeader || '').toLowerCase();
  const addr = extractEmail(fromHeader);
  for (const b of businessEmailsLowercased) {
    if (!b) continue;
    if (addr && addr === b) return 'OUTBOUND';
    if (hay.includes(b)) return 'OUTBOUND';
  }
  return 'INBOUND';
}

function shapeThreadResponse(thread) {
  return {
    arId: thread.arId,
    invoiceNo: thread.invoiceNo,
    messages: (thread.messages || []).map((m) => ({
      direction: m.direction,
      subject: m.subject,
      body: m.body,
      timestamp: m.timestamp,
    })),
  };
}

async function syncEmailThread(arId, fetchOpts = {}) {
  const oid = toObjectId(arId);
  if (!oid) throw new AppError('Invalid AR entry id', 400);

  const entry = await arEntryRepository.findById(oid);
  if (!entry) throw new AppError('AR entry not found', 404);

  const peerEmail = await emailJob.resolveRecipientEmailForArEntry(entry);
console.log('peerEmail', peerEmail);
  const emails = await emailReader.fetchEmails(fetchOpts);
  console.log('emails', emails);
  let filtered = emails.filter((e) => emailBelongsToArEntry(e, entry, peerEmail));
  filtered = expandThreadByInReplyTo(emails, filtered);

  const biz = collectBusinessEmails().map((e) => e.toLowerCase());

  const chronological = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const e of chronological) {
    const direction = resolveDirection(e.from, biz);
    try {
      await emailService.addEmailMessage({
        arId: String(oid),
        messageId: e.messageId,
        direction,
        from: e.from || '(unknown)',
        to: e.to || '(unknown)',
        subject: e.subject || '',
        body: e.body || '',
        timestamp: e.date,
        invoiceNo: entry.invoiceNo,
        metadata: { source: 'email-sync', mailbox: 'INBOX' },
      });
    } catch (err) {
      logger.warn('[email-sync] message not persisted', { messageId: e.messageId, error: err.message });
    }
  }

  const thread = await emailService.getEmailThread(arId);
  return shapeThreadResponse(thread);
}

module.exports = {
  syncEmailThread,
};
