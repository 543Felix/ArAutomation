const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

function getSmtpConfig() {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.EMAIL_FROM || process.env.SMTP_USER || '').trim(),
  };
}

function isConfigured() {
  const c = getSmtpConfig();
  return Boolean(c.host && c.from);
}

function createTransporter() {
  const c = getSmtpConfig();
  if (!c.host) {
    throw new Error('SMTP_HOST is not configured');
  }

  const auth =
    c.user && c.pass ? { user: c.user, pass: c.pass } : undefined;

  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    ...(auth ? { auth } : {}),
  });
}

/**
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   text?: string,
 *   html?: string,
 *   attachments?: import('nodemailer').SendMailOptions['attachments'],
 * }} options
 */
async function sendMail(options) {
  const c = getSmtpConfig();
  if (!c.from) {
    throw new Error('EMAIL_FROM (or SMTP_USER) is not configured');
  }
  if (!options?.to) {
    throw new Error('sendMail: `to` is required');
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: c.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  });

  logger.info('mailer.sendMail ok', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  });

  return info;
}

module.exports = {
  getSmtpConfig,
  isConfigured,
  createTransporter,
  sendMail,
};
