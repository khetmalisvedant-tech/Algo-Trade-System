// netlify/functions/save-token.js
// ADMIN ONLY: Updates the KITE_ACCESS_TOKEN environment variable via Netlify API.
//
// Two modes:
// 1. POST: Manual token update (admin clicks "Connect" in dashboard)
// 2. GET: Auto token exchange (Kite redirects here with request_token)
//
// Required env vars (set once, never change):
//   NETLIFY_SITE_ID   = your Netlify site ID (found in Site settings → General)
//   NETLIFY_API_TOKEN = a personal access token from app.netlify.com/user/applications
//   ADMIN_EMAIL       = your email (for admin-only check)
//   KITE_API_SECRET   = your Kite API secret (for auto token exchange only)

const crypto = require('crypto');

// Helper: update env var via Netlify API
async function updateNetlifyEnv(key, value) {
  const netlifyToken = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!netlifyToken || !siteId) {
    console.log('NETLIFY_API_TOKEN or NETLIFY_SITE_ID not set');
    return false;
  }

  try {
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        { key, values: [{ context: 'all', value }] }
      ]),
    });
    return res.ok;
  } catch (err) {
    console.error('Netlify API error:', err);
    return false;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  // ============= GET: Handle Kite redirect =============
  if (event.httpMethod === 'GET' && event.queryStringParameters?.request_token) {
    const requestToken = event.queryStringParameters.request_token;
    const apiKey    = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'KITE_API_KEY or KITE_API_SECRET not configured' })
      };
    }

    try {
      // Generate checksum: sha256(api_key + request_token + api_secret)
      const checksum = crypto.createHash('sha256')
        .update(apiKey + requestToken + apiSecret)
        .digest('hex');

      // Exchange for access token
      const tokenRes = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
          'X-Kite-Version': '3',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          api_key: apiKey, request_token: requestToken, checksum
        }).toString()
      });

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.data?.access_token;

      if (accessToken) {
        // Save to Netlify env var
        await updateNetlifyEnv('KITE_ACCESS_TOKEN', accessToken);
        // Redirect back to dashboard
        return {
          statusCode: 302,
          headers: { Location: '/dashboard.html?kite=connected' }
        };
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Failed to exchange token: ' + tokenData.message })
        };
      }
    } catch (err) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Token exchange failed: ' + err.message })
      };
    }
  }

  // ============= POST: Manual token update =============
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

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
    // Update env vars via Netlify API
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