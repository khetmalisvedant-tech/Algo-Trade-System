// netlify/functions/save-token.js — PRODUCTION VERSION
// Handles OAuth redirect, exchanges tokens, and manages persistence

const crypto = require('crypto');

// In-memory store (shared across warm function instances within same execution)
let cachedToken = null;
let cachedTokenTime = 0;

// ──────────────────────────────────────────────────────────────────────────
// NETLIFY ENV VAR PERSISTENCE (OPTIONAL)
// ──────────────────────────────────────────────────────────────────────────
// This updates Netlify environment variables so token persists across deployments
// Set NETLIFY_API_TOKEN and NETLIFY_SITE_ID in your Netlify dashboard

async function persistTokenToNetlify(accessToken) {
  const netlifyToken = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!netlifyToken || !siteId) {
    console.log('[save-token] Netlify persistence not configured (optional)');
    return false;
  }

  try {
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${netlifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          key: 'KITE_ACCESS_TOKEN',
          values: [{ context: 'all', value: accessToken }],
        },
      ]),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('[save-token] Failed to persist to Netlify:', err.message);
      return false;
    }

    console.log('[save-token] ✅ Token persisted to Netlify env vars');
    return true;
  } catch (error) {
    console.warn('[save-token] Netlify persistence error:', error.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// BACKEND SERVER TOKEN UPDATE (Render.com / Node backend)
// ──────────────────────────────────────────────────────────────────────────
// This tells your WebSocket backend to refresh its ticker connection

async function updateBackendToken(accessToken) {
  const backendUrl = process.env.RENDER_BACKEND_URL; // Set in Netlify env
  const internalSecret = process.env.INTERNAL_SECRET;

  if (!backendUrl || !internalSecret) {
    console.log('[save-token] Backend URL not configured (optional)');
    return false;
  }

  try {
    const response = await fetch(`${backendUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        secret: internalSecret,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('[save-token] Backend token update failed:', err.error || err.message);
      return false;
    }

    console.log('[save-token] ✅ Token sent to backend server');
    return true;
  } catch (error) {
    console.warn('[save-token] Backend token update error:', error.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('[save-token] KITE_API_KEY or KITE_API_SECRET not configured');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'OAuth not configured. Admin must set KITE_API_KEY and KITE_API_SECRET.',
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET: Zerodha OAuth callback or status check
  // ──────────────────────────────────────────────────────────────────────────

  if (event.httpMethod === 'GET') {
    const requestToken = event.queryStringParameters?.request_token;

    // If no request_token, return current token status
    if (!requestToken) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: !!cachedToken,
          has_token: !!cachedToken,
          token_age_minutes: cachedToken ? Math.round((Date.now() - cachedTokenTime) / 60000) : null,
          cached: true,
        }),
      };
    }

    // ────────────────────────────────────────────────────────────────────────
    // EXCHANGE REQUEST_TOKEN FOR ACCESS_TOKEN
    // ────────────────────────────────────────────────────────────────────────

    try {
      console.log('[save-token] Processing OAuth callback...');

      // Step 1: Generate checksum (Zerodha requirement)
      const checksum = crypto
        .createHash('sha256')
        .update(apiKey + requestToken + apiSecret)
        .digest('hex');

      // Step 2: Exchange request_token for access_token
      console.log('[save-token] Exchanging request_token for access_token...');
      const tokenResponse = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
          'X-Kite-Version': '3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          api_key: apiKey,
          request_token: requestToken,
          checksum: checksum,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        const message = errorData.message || `Zerodha error: ${tokenResponse.status}`;
        console.error('[save-token] Token exchange failed:', message);
        
        return {
          statusCode: 302,
          headers: {
            'Location': `/dashboard?kite=error&reason=${encodeURIComponent(message)}`,
          },
          body: '',
        };
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.data?.access_token;
      const userId = tokenData.data?.user_id;

      if (!accessToken) {
        console.error('[save-token] No access_token in response:', tokenData);
        return {
          statusCode: 302,
          headers: {
            'Location': '/dashboard?kite=error&reason=no_token_received',
          },
          body: '',
        };
      }

      // Step 3: Store in memory
      cachedToken = accessToken;
      cachedTokenTime = Date.now();
      console.log('[save-token] ✅ Token obtained and cached');

      // Step 4: Persist to Netlify env var (best-effort)
      await persistTokenToNetlify(accessToken);

      // Step 5: Update backend server (best-effort)
      await updateBackendToken(accessToken);

      // Step 6: Redirect to dashboard with success
      return {
        statusCode: 302,
        headers: {
          'Location': `/dashboard?kite=connected&user=${encodeURIComponent(userId || 'user')}`,
        },
        body: '',
      };

    } catch (error) {
      console.error('[save-token] OAuth error:', error.message);
      return {
        statusCode: 302,
        headers: {
          'Location': `/dashboard?kite=error&reason=${encodeURIComponent(error.message)}`,
        },
        body: '',
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST: Dashboard requests current token or token status
  // ──────────────────────────────────────────────────────────────────────────

  if (event.httpMethod === 'POST') {
    // Return the cached token so dashboard can use it directly
    if (cachedToken) {
      const ageSeconds = Math.floor((Date.now() - cachedTokenTime) / 1000);
      console.log(`[save-token] Returning cached token (age: ${ageSeconds}s)`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          access_token: cachedToken,
          cached: true,
          age_seconds: ageSeconds,
        }),
      };
    }

    // Fall back to env var if available (from Netlify persistence)
    const envToken = process.env.KITE_ACCESS_TOKEN;
    if (envToken) {
      cachedToken = envToken;
      cachedTokenTime = Date.now();
      console.log('[save-token] Using token from Netlify env vars');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          access_token: envToken,
          source: 'env_var',
          note: 'Token is from Netlify environment — may be expired. User should click Kite Login if errors occur.',
        }),
      };
    }

    // No token available
    console.warn('[save-token] No token available');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'No token available — please click Kite Login to authenticate',
      }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method Not Allowed' }),
  };
};