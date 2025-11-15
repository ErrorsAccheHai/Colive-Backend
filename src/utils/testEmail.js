require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  try {
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'ashishbhartijnv@gmail.com',
      subject: 'Test Email',
      html: '<p>This is a test email from Co-Live</p>'
    });

    console.log('Test email sent successfully:', data);
  } catch (error) {
    console.error('Failed to send test email:', error);
  }
}

testEmail();