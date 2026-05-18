// netlify/functions/is-admin.js
// Returns { isAdmin: true/false } based on whether the logged-in Identity user
// matches the ADMIN_EMAIL env var you set in Netlify dashboard.
//
// Set these in Netlify → Project config → Environment variables:
//   ADMIN_EMAIL   = your email address (the one you used to create the Netlify Identity account)
//
// The function reads the JWT from the Authorization header that Netlify Identity
// automatically injects for logged-in users on Netlify sites.

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Netlify Identity injects the user context via the clientContext
    const context = event.clientContext;
    const user = context && context.user;

    if (!user) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: false, reason: 'not_logged_in' }),
      };
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

    if (!adminEmail) {
      console.warn('ADMIN_EMAIL env var not set — no admin access possible');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isAdmin: false, reason: 'admin_not_configured' }),
      };
    }

    const userEmail = (user.email || '').toLowerCase().trim();
    const isAdmin = userEmail === adminEmail;

    console.log(`Admin check: ${userEmail} === ${adminEmail} → ${isAdmin}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin, email: userEmail }),
    };
  } catch (err) {
    console.error('is-admin error:', err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ isAdmin: false, reason: 'error' }),
    };
  }
};
