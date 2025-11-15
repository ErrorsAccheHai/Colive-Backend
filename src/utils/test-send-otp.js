require('dotenv').config();
const sendOtpMail = require('./sendOtp');

async function run() {
  const recipient = process.argv[2] || process.env.TEST_RECIPIENT;
  if (!recipient) {
    console.error('Usage: node test-send-otp.js <recipient-email>\nOr set TEST_RECIPIENT in .env');
    process.exit(1);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const res = await sendOtpMail(recipient, otp);
    console.log('Test send result:', res);
  } catch (err) {
    console.error('Test send failed:', err);
    process.exit(2);
  }
}

run();
