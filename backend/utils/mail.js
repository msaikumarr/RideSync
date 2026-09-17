const nodemailer = require('nodemailer');

let transporter;

const createFallbackTransporter = async () => {
  // In development, use Ethereal test account so you can view real previews
  if (process.env.NODE_ENV === 'production') {
    // production requires SMTP configured
    throw new Error('SMTP not configured in production');
  }

  const testAccount = await nodemailer.createTestAccount();
  const testTransport = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });
  return { transporter: testTransport, testAccount };
};

const ensureTransporter = async () => {
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

async function sendMail({ to, from, subject, text, html }) {
  const { transporter, testAccount } = await ensureTransporter();

  const mailOpts = {
    from: from || process.env.FROM_EMAIL || process.env.SMTP_USER || (testAccount && testAccount.user),
    to,
    subject,
    text,
    html
  };

  const info = await transporter.sendMail(mailOpts);
  // if using Ethereal, log preview URL
  if (testAccount && info && info.messageId) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Ethereal preview URL:', previewUrl);
    return { info, previewUrl };
  }
  return { info };
}

module.exports = { sendMail };
