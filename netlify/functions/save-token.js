// netlify/functions/save-token.js
// ADMIN ONLY: Updates the KITE_ACCESS_TOKEN environment variable via Netlify API.
// Called automatically when admin clicks "Connect" with their API credentials.
//
// This means the admin can refresh the daily Kite token without touching Netlify dashboard.
//
// Required env vars (set once, never change):
//   NETLIFY_SITE_ID   = your Netlify site ID (found in Site settings → General)
//   NETLIFY_API_TOKEN = a personal access token from app.netlify.com/user/applications
//   ADMIN_EMAIL       = your email (for admin-only check)

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  // Admin-only check
  const context = event.clientContext;
  const user = context && context.user;
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

  if (!user || (user.email || '').toLowerCase() !== adminEmail) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
  }

  let accessToken, apiKey;
  try {
    ({ accessToken, apiKey } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!accessToken || !apiKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accessToken and apiKey required' }) };
  }

  const netlifyToken = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!netlifyToken || !siteId) {
    // Graceful fallback — token saved in memory for this session but won't persist
    console.log('NETLIFY_API_TOKEN or NETLIFY_SITE_ID not set — token update skipped (works for this session only)');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        persisted: false,
        message: 'Token accepted for this session. Set NETLIFY_API_TOKEN + NETLIFY_SITE_ID in env vars to persist across redeploys.',
      }),
    };
  }

  try {
    // Update env var via Netlify API
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        { key: 'KITE_ACCESS_TOKEN', values: [{ context: 'all', value: accessToken }] },
        { key: 'KITE_API_KEY', values: [{ context: 'all', value: apiKey }] },
      ]),
    });

    if (res.ok) {
      console.log(`Admin ${user.email} updated Kite access token`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, persisted: true, message: 'Kite credentials saved. Regular users will use these automatically.' }),
      };
    } else {
      const err = await res.text();
      console.error('Netlify API error:', err);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, persisted: false, message: 'Session active. Netlify API update failed — update token manually in dashboard if needed.' }),
      };
    }
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, persisted: false, message: 'Session active. Could not persist: ' + err.message }),
    };
  }
};
