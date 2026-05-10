/**
 * IMAP settings for `imap-simple` / thread sync (passed 1:1 to node-imap).
 * Gmail: IMAP_HOST=imap.gmail.com IMAP_PORT=993 IMAP_TLS=true (+ app password).
 * Mailpit IMAP: IMAP_HOST=localhost IMAP_PORT=1143 IMAP_TLS=false — or use MAILPIT_HTTP_URL for REST.
 * TLS errors behind a proxy: prefer NODE_EXTRA_CA_CERTS; dev-only IMAP_TLS_REJECT_UNAUTHORIZED=false.
 */
function authTimeout() {
  return Math.min(Math.max(Number(process.env.IMAP_AUTH_TIMEOUT) || 3000, 1000), 60000);
}

function trim(key) {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim();
}

const host = trim('IMAP_HOST') || 'imap.gmail.com';
const port =
  Number(process.env.IMAP_PORT) > 0
    ? Number(process.env.IMAP_PORT)
    : host === 'localhost' || host === '127.0.0.1'
      ? 1143
      : 993;

const tlsDefault =
  host === 'localhost' || host === '127.0.0.1' ? false : true;
const tls =
  process.env.IMAP_TLS === 'true'
    ? true
    : process.env.IMAP_TLS === 'false'
      ? false
      : tlsDefault;

/** When `false`, TLS certificate verification is disabled (MITM / broken corp proxy workarounds only). */
const tlsRejectUnauthorized =
  String(process.env.IMAP_TLS_REJECT_UNAUTHORIZED ?? 'true').toLowerCase() !== 'false';

const imap = {
  user: trim('IMAP_USER') || trim('SMTP_USER') || 'any',
  password: trim('IMAP_PASSWORD') || trim('IMAP_PASS') || trim('SMTP_PASS') || 'any',
  host,
  port,
  tls,
  authTimeout: authTimeout(),
};

if (tls && !tlsRejectUnauthorized) {
  imap.tlsOptions = { rejectUnauthorized: false };
}

module.exports = { imap };
