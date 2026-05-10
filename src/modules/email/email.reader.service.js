const imaps = require('imap-simple');
const logger = require('../../utils/logger');
const imapConfig = require('../../config/imap');

function hdrFirst(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return val.map(String).join(' ').trim();
  return String(val).trim();
}

function normalizeMessageId(raw) {
  const s = hdrFirst(raw);
  return s.replace(/^<|>$/g, '').trim();
}

function decodeTextBody(raw) {
  if (raw == null) return '';
  if (Buffer.isBuffer(raw)) {
    const asUtf8 = raw.toString('utf8');
    if (asUtf8.replace(/\s/g, '').length > 0) return asUtf8;
    return raw.toString('binary');
  }
  if (typeof raw !== 'string') return String(raw);
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const trimmed = decoded.trim();
    if (
      trimmed.length > 0 &&
      /^[\x09\x0A\x0D\x20-\x7E]+$/.test(trimmed.slice(0, Math.min(trimmed.length, 120)))
    ) {
      return decoded;
    }
  } catch (_) {
    /* ignore */
  }
  return raw;
}

function parseFetchedMessage(item) {
  try {
    const parts = item.parts || [];
    const headerPart = parts.find((p) => p.which === 'HEADER');
    const textPart = parts.find((p) => p.which === 'TEXT');

    const hb = headerPart?.body || {};
    const subject = hdrFirst(hb.subject);
    const from = hdrFirst(hb.from);
    const to = hdrFirst(hb.to);
    const dateStr = hdrFirst(hb.date);
    const midRaw = normalizeMessageId(hb['message-id']);

    const uid = item.attributes?.uid;
    const messageId = midRaw || `imap-uid-${uid ?? 'unknown'}`;

    const body = decodeTextBody(textPart?.body);

    const inReplyTo = normalizeMessageId(hb['in-reply-to']);

    let date = dateStr ? new Date(dateStr) : null;
    if (!date || Number.isNaN(date.getTime())) {
      date = new Date();
    }

    return { messageId, subject, from, to, date, body, inReplyTo };
  } catch (err) {
    logger.warn('[email-reader] parse message skipped', { message: err.message });
    return null;
  }
}

function formatMailpitAddress(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const name = String(addr.Name || '').trim();
  const email = String(addr.Address || '').trim();
  if (name && email) return `${name} <${email}>`;
  return email || '';
}

function formatMailpitToList(toArr) {
  if (!Array.isArray(toArr)) return '';
  return toArr.map(formatMailpitAddress).filter(Boolean).join(', ');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveFetchWindow(options = {}) {
  const envDays = Number(process.env.IMAP_SINCE_DAYS);
  const defaultDays = Number.isFinite(envDays) && envDays > 0 ? Math.min(envDays, 30) : 5;
  const sinceDaysRaw =
    options.sinceDays != null ? Number(options.sinceDays) : defaultDays;
  const sinceDays = Math.min(
    Math.max(Number.isFinite(sinceDaysRaw) ? sinceDaysRaw : defaultDays, 1),
    30,
  );

  const searchAll =
    options.searchAll === true ||
    process.env.IMAP_SEARCH_ALL === 'true' ||
    process.env.IMAP_FETCH_ALL === 'true';

  const envMax = Number(process.env.IMAP_MAX_FETCH);
  const maxFetchDefault = Number.isFinite(envMax) && envMax > 0 ? Math.min(envMax, 500) : 200;
  const maxFetchRaw = options.maxFetch != null ? Number(options.maxFetch) : maxFetchDefault;
  const maxFetch = Math.min(
    Math.max(Number.isFinite(maxFetchRaw) ? maxFetchRaw : maxFetchDefault, 1),
    500,
  );

  return { sinceDays, searchAll, maxFetch };
}

async function fetchEmailsViaMailpitHttp(base, options = {}) {
  const { sinceDays, searchAll, maxFetch } = resolveFetchWindow(options);
  const cutoffMs = searchAll ? null : Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  try {
    const listUrl = `${base}/api/v1/messages?limit=${encodeURIComponent(String(maxFetch))}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) {
      throw new Error(`Mailpit list HTTP ${listRes.status}`);
    }
    const listJson = await listRes.json();
    const rows = Array.isArray(listJson.messages) ? listJson.messages : [];

    const out = [];
    for (const row of rows) {
      const id = row.ID;
      if (!id) continue;

      const createdList = row.Created ? new Date(row.Created) : null;
      if (cutoffMs != null && createdList && !Number.isNaN(createdList.getTime())) {
        if (createdList.getTime() < cutoffMs) continue;
      }

      const detailRes = await fetch(`${base}/api/v1/message/${encodeURIComponent(id)}`);
      if (!detailRes.ok) continue;
      const msg = await detailRes.json();

      const created =
        msg.Date && !Number.isNaN(new Date(msg.Date).getTime())
          ? new Date(msg.Date)
          : createdList && !Number.isNaN(createdList.getTime())
            ? createdList
            : new Date();

      if (cutoffMs != null && created.getTime() < cutoffMs) continue;

      const midRaw = normalizeMessageId(msg.MessageID || row.MessageID || '') || `mailpit-${id}`;
      const subject = msg.Subject != null ? String(msg.Subject) : String(row.Subject || '');
      const from = formatMailpitAddress(msg.From || row.From);
      const to = formatMailpitToList(msg.To || row.To);
      const body =
        (msg.Text && String(msg.Text).trim()) ||
        stripHtml(msg.HTML) ||
        (row.Snippet && String(row.Snippet).trim()) ||
        '';

      const inReplyTo = normalizeMessageId(
        msg.InReplyTo ||
          msg.inReplyTo ||
          (msg.Headers && (msg.Headers['In-Reply-To'] || msg.Headers['In-reply-to'])) ||
          '',
      );

      out.push({
        messageId: midRaw,
        subject,
        from,
        to,
        date: created,
        body,
        inReplyTo,
      });
    }

    return out;
  } catch (err) {
    const cause = err?.cause;
    logger.warn('[email-reader] Mailpit HTTP unavailable — returning no messages', {
      message: err.message,
      ...(cause && { cause: cause.message || String(cause) }),
    });
    return [];
  }
}

async function fetchEmailsImap(options = {}) {
  const { sinceDays, searchAll, maxFetch } = resolveFetchWindow(options);

  let connection;
  try {
    connection = await imaps.connect(imapConfig);
    await connection.openBox('INBOX');

    let searchCriteria;
    if (searchAll) {
      searchCriteria = ['ALL'];
    } else {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      // node-imap expects criteria-with-args as nested arrays, not flat ['SINCE', date].
      searchCriteria = [['SINCE', since]];
    }

    const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: false };
    let results = await connection.search(searchCriteria, fetchOptions);
    if (!Array.isArray(results)) results = [];

    if (results.length > maxFetch) {
      results = results.slice(results.length - maxFetch);
    }

    try {
      connection.end();
    } catch (_) {
      /* ignore */
    }
    connection = null;

    return results.map(parseFetchedMessage).filter(Boolean);
  } catch (err) {
    const msg = String(err?.message || '');
    const looksTlsCert =
      /certificate|self-signed|unable to verify|cert.?verify|depth_zero|unknown ca/i.test(msg);
    const relaxedTls =
      String(process.env.IMAP_TLS_REJECT_UNAUTHORIZED ?? 'true').toLowerCase() === 'false';
    logger.warn('[email-reader] IMAP unavailable — returning no messages', {
      message: err.message,
      ...(looksTlsCert &&
        !relaxedTls && {
          tlsHint:
            'Set IMAP_TLS_REJECT_UNAUTHORIZED=false (dev / inspected TLS only) or trust your proxy CA via NODE_EXTRA_CA_CERTS.',
        }),
    });
    try {
      if (connection) connection.end();
    } catch (_) {
      /* ignore */
    }
    return [];
  }
}

function normalizeMailpitHttpBase(raw) {
  const s = String(raw || '').trim().replace(/\/$/, '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `http://${s}`;
}

function mailpitHttpBaseEffective() {
  if (
    process.env.EMAIL_SYNC_FORCE_IMAP === 'true' ||
    process.env.EMAIL_SYNC_USE_IMAP === 'true'
  ) {
    return '';
  }
  return normalizeMailpitHttpBase(process.env.MAILPIT_HTTP_URL || '');
}

/**
 * Mailpit REST when **`MAILPIT_HTTP_URL`** set; otherwise **IMAP** via {@link ../../config/imap}.
 * Set **`EMAIL_SYNC_FORCE_IMAP=true`** to skip Mailpit HTTP.
 */
async function fetchEmails(options = {}) {
  const base = mailpitHttpBaseEffective();
  if (base) {
    return fetchEmailsViaMailpitHttp(base, options);
  }
  return fetchEmailsImap(options);
}

module.exports = {
  fetchEmails,
};
