// functions/save-token.js
// Handles Kite OAuth redirect — exchanges request_token for access_token automatically.
// Only requires KITE_API_KEY and KITE_API_SECRET in Netlify env vars.
// The access token is stored in a module-level variable (persists for the function's lifetime)
// AND written to a Netlify env var if NETLIFY_API_TOKEN + NETLIFY_SITE_ID are set.

const crypto = require('crypto');

// In-memory store (shared across warm function instances)
let cachedToken = null;
let cachedTokenTime = 0;

// Helper: update Netlify env var (optional — only if NETLIFY_API_TOKEN is set)
async function tryPersistToken(accessToken) {
  const netlifyToken = process.env.NETLIFY_API_TOKEN;
  const siteId       = process.env.NETLIFY_SITE_ID;
  if (!netlifyToken || !siteId) return false;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        { key: 'KITE_ACCESS_TOKEN', values: [{ context: 'all', value: accessToken }] }
      ]),
    });
    return res.ok;
  } catch { return false; }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const apiKey    = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  // ── GET: Kite redirects here with ?request_token=xxx ──
  if (event.httpMethod === 'GET') {
    const requestToken = event.queryStringParameters?.request_token;

    // If someone calls GET /.netlify/functions/save-token without a request_token
    // → return current cached token status
    if (!requestToken) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: !!cachedToken,
          has_token: !!cachedToken,
          token_age_minutes: cachedToken ? Math.round((Date.now() - cachedTokenTime) / 60000) : null,
        }),
      };
    }

    if (!apiKey || !apiSecret) {
      return {
        statusCode: 302,
        headers: { Location: '/dashboard.html?kite=error&reason=missing_env' },
      };
    }

    try {
      // Generate SHA256 checksum: api_key + request_token + api_secret
      const checksum = crypto
        .createHash('sha256')
        .update(apiKey + requestToken + apiSecret)
        .digest('hex');

      // Exchange request_token for access_token
      const tokenRes = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
          'X-Kite-Version': '3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }).toString(),
      });

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.data?.access_token;

      if (!accessToken) {
        console.error('Token exchange failed:', tokenData);
        return {
          statusCode: 302,
          headers: { Location: `/dashboard.html?kite=error&reason=${encodeURIComponent(tokenData.message || 'exchange_failed')}` },
        };
      }

      // Store in memory
      cachedToken     = accessToken;
      cachedTokenTime = Date.now();

      // Try to persist to Netlify env (optional, best-effort)
      await tryPersistToken(accessToken);

      // Redirect back to dashboard with success
      return {
        statusCode: 302,
        headers: { Location: '/dashboard.html?kite=connected' },
      };

    } catch (err) {
      console.error('save-token error:', err);
      return {
        statusCode: 302,
        headers: { Location: `/dashboard.html?kite=error&reason=${encodeURIComponent(err.message)}` },
      };
    }
  }

  // ── POST: Dashboard requests current token ──
  if (event.httpMethod === 'POST') {
    // Return the cached token so dashboard can use it directly
    if (cachedToken) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, access_token: cachedToken }),
      };
    }
    // Fall back to env var if available
    const envToken = process.env.KITE_ACCESS_TOKEN;
    if (envToken) {
      cachedToken     = envToken;
      cachedTokenTime = Date.now();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, access_token: envToken }),
      };
    }
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ ok: false, error: 'No token available — please click Kite Login' }),
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};