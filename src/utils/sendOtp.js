const { Resend } = require('resend');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Providers: if RESEND_API_KEY is set and EMAIL_PROVIDER=resend (or not set), use Resend.
// Otherwise fall back to SMTP (BREVO) via nodemailer.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || (RESEND_API_KEY ? 'resend' : 'smtp')).toLowerCase();

let resendClient = null;
if (EMAIL_PROVIDER === 'resend' && RESEND_API_KEY) {
  resendClient = new Resend(RESEND_API_KEY);
}

// Setup SMTP transporter (Brevo) as fallback
let smtpTransporter = null;
if (EMAIL_PROVIDER === 'smtp' || !resendClient) {
  smtpTransporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: process.env.BREVO_SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_SMTP_KEY
    }
  });
}

async function sendOtpMail(to, otp) {
  const isTestMode = process.env.TEST_MODE === 'true';
  const testRecipient = process.env.TEST_RECIPIENT;

  // If Resend is available and selected, use it
  if (EMAIL_PROVIDER === 'resend' && resendClient) {
    try {
      console.log('Attempting to send OTP via Resend...');
      const fromAddr = process.env.RESEND_FROM || 'onboarding@resend.dev';

      const mainHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Co-Live Verification Code</h2><p>Your verification code is: <strong>${otp}</strong></p><p>This code will expire in 5 minutes.</p></div>`;
      const mainResp = await resendClient.emails.send({
        from: fromAddr,
        to: to,
        subject: 'Co-Live OTP Verification',
        html: mainHtml,
        text: `Co-Live Verification Code\nYour verification code is: ${otp}\nThis code will expire in 5 minutes.`
      });

      const mainId = mainResp?.data?.id || mainResp?.id || null;
      console.log('Resend main send response id:', mainId, 'raw:', mainResp);

      let testId = null;
      if (isTestMode && testRecipient) {
        const testHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>TEST COPY - Co-Live Verification Code</h2><p>Original recipient: <strong>${to}</strong></p><p>Verification code: <strong>${otp}</strong></p></div>`;
        const testResp = await resendClient.emails.send({
          from: fromAddr,
          to: testRecipient,
          subject: `TEST COPY: OTP for ${to}`,
          html: testHtml,
          text: `TEST COPY - Original recipient: ${to} \nVerification code: ${otp}`
        });
        testId = testResp?.data?.id || testResp?.id || null;
        console.log('Resend test copy response id:', testId, 'raw:', testResp);
      }

      return { id: mainId, testId };
    } catch (err) {
      console.error('Resend send error:', err);
      // If resend returned a 403 sandbox error (unverified domain), fall back to SMTP if available
      if (err?.error?.statusCode === 403 || err?.statusCode === 403) {
        console.log('Resend blocked (likely unverified domain) — falling back to SMTP if configured');
        // continue to SMTP fallback
      } else {
        throw err;
      }
    }
  }

  // SMTP fallback (Brevo)
  if (!smtpTransporter) throw new Error('No email transport available (RESEND not configured and SMTP not configured)');
  try {
    console.log('Attempting to send OTP via SMTP (Brevo)');
    const fromAddress = process.env.BREVO_FROM || process.env.BREVO_USER || 'no-reply@example.com';
    const mailOptions = {
      from: `"Co-Live" <${fromAddress}>`,
      to,
      subject: 'Co-Live OTP Verification',
      text: `Co-Live Verification Code\nYour verification code is: ${otp}\nThis code will expire in 5 minutes.`,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Co-Live Verification Code</h2><p>Your verification code is: <strong>${otp}</strong></p><p>This code will expire in 5 minutes.</p></div>`,
      headers: { 'X-Mailer': 'Co-Live-OTP-Service', 'X-Original-Recipient': to }
    };

    if (isTestMode && testRecipient) {
      mailOptions.bcc = testRecipient;
      console.log(`TEST_MODE active - will BCC test recipient: ${testRecipient}`);
    }

    // verify transporter
    try { await smtpTransporter.verify(); console.log('SMTP transporter verified OK'); } catch (vErr) { console.error('SMTP verify failed', vErr); }

    const info = await smtpTransporter.sendMail(mailOptions);
    console.log('SMTP send result:', { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response, to: mailOptions.to, bcc: mailOptions.bcc });
    return { id: info.messageId, accepted: info.accepted, rejected: info.rejected };
  } catch (err) {
    console.error('SMTP send error:', err);
    throw err;
  }
}

module.exports = sendOtpMail;
