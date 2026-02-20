const nodemailer = require('nodemailer');

let cachedTransporter = null;

function isMailConfigured() {
  return Boolean(
    process.env.MAIL_HOST &&
    process.env.MAIL_PORT &&
    process.env.MAIL_USER &&
    process.env.MAIL_PASS
  );
}

function getMailer() {
  if (cachedTransporter) return cachedTransporter;
  if (!isMailConfigured()) return null;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE) === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  return cachedTransporter;
}

async function verifyMailer() {
  const transporter = getMailer();
  if (!transporter) {
    return { ok: false, reason: 'mail_not_configured' };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || 'smtp_verify_failed' };
  }
}

async function sendMailOrThrow({ to, subject, text, html }) {
  const transporter = getMailer();
  if (!transporter) {
    throw new Error('mail_not_configured');
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
    html,
  });
}

async function sendMailSafe({ to, subject, text, html }) {
  try {
    await sendMailOrThrow({ to, subject, text, html });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'mail_send_failed',
    };
  }
}

module.exports = {
  isMailConfigured,
  getMailer,
  verifyMailer,
  sendMailOrThrow,
  sendMailSafe,
};
