const nodemailer = require('nodemailer');

let transporter;

// Dev-only preview inbox, used when no real email provider is configured.
const createFallbackTransporter = async () => {
  const testAccount = await nodemailer.createTestAccount();
  const testTransport = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });
  return { transporter: testTransport, testAccount };
};

const ensureSmtpTransporter = async () => {
  if (transporter) return { transporter };
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
    try {
      await transporter.verify();
      return { transporter };
    } catch (verifyErr) {
      console.error('SMTP verify failed, falling back to Ethereal:', verifyErr.message || verifyErr);
      transporter = undefined;
      // fall through to createFallbackTransporter
    }
  }

  const fallback = await createFallbackTransporter();
  transporter = fallback.transporter;
  transporter._testAccount = fallback.testAccount;
  return { transporter, testAccount: fallback.testAccount };
};

// Brevo's transactional email API (HTTPS), not raw SMTP — avoids the
// connection timeouts/blocks that plain SMTP hits from cloud hosts like
// Render when talking to providers like Gmail.
const sendViaBrevo = async ({ to, from, subject, text, html }) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { email: from },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }

  return res.json();
};

async function sendMail({ to, from, subject, text, html }) {
  const fromAddress = from || process.env.FROM_EMAIL || process.env.SMTP_USER;

  if (process.env.BREVO_API_KEY) {
    const info = await sendViaBrevo({ to, from: fromAddress, subject, text, html });
    return { info };
  }

  if (process.env.NODE_ENV === 'production' && !(process.env.SMTP_HOST && process.env.SMTP_USER)) {
    throw new Error('No email provider configured in production (set BREVO_API_KEY or SMTP_*)');
  }

  const { transporter, testAccount } = await ensureSmtpTransporter();

  const info = await transporter.sendMail({
    from: fromAddress || (testAccount && testAccount.user),
    to,
    subject,
    text,
    html
  });

  // if using Ethereal, log preview URL
  if (testAccount && info && info.messageId) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Ethereal preview URL:', previewUrl);
    return { info, previewUrl };
  }
  return { info };
}

module.exports = { sendMail };
