// netlify/functions/request-access.js
// When a visitor requests access, this notifies the admin by email.
// Set ADMIN_EMAIL in Netlify environment variables (Site config > Environment variables).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: 'Invalid email' };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const siteUrl = process.env.URL || 'https://your-site.netlify.app';

  // Use Netlify's built-in email if configured, or log for manual handling
  // For production: plug in SendGrid / Resend / Nodemailer via SMTP env vars
  console.log(`ACCESS REQUEST: ${email} wants access to ${siteUrl}`);

  // If you set up an email provider, add sending logic here.
  // Example with fetch to a transactional email API:
  /*
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  if (SENDGRID_KEY) {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: adminEmail }] }],
        from: { email: 'noreply@your-domain.com' },
        subject: `RSI Trader: Access Request from ${email}`,
        content: [{
          type: 'text/plain',
          value: `Someone requested access to your RSI Trading Dashboard.\n\nEmail: ${email}\n\nTo approve, go to:\n${siteUrl}/.netlify/identity/admin\n\nThen click "Invite user" and enter their email.`
        }]
      })
    });
  }
  */

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Request received' })
  };
};
