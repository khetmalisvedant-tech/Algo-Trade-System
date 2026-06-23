// netlify/functions/kite-proxy.js — PRODUCTION VERSION
// Secure proxy for Zerodha Kite API calls on behalf of authenticated users
// API key and token stored in Netlify env vars (server-side only, never exposed to client)

const KITE_BASE = 'https://api.kite.trade';

// Endpoints we allow proxying — whitelist for security
const ALLOWED_ENDPOINTS = new Set([
  '/user/profile',
  '/user/margins',
  '/quote',
  '/orders/regular',
  '/positions',
  '/holdings',
  '/margins',
  '/instruments',
  '/portfolio/positions',
  '/portfolio/holdings',
  '/orders',
]);

function isEndpointAllowed(endpoint) {
  const basePath = endpoint.split('?')[0];
  return Array.from(ALLOWED_ENDPOINTS).some((allowed) => basePath.startsWith(allowed));
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'http://localhost:8888',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // ──────────────────────────────────────────────────────────────────────────
  // CORS PREFLIGHT
  // ──────────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ──────────────────────────────────────────────────────────────────────────
  const context = event.clientContext;
  const user = context?.user;

  if (!user) {
    console.warn('[kite-proxy] Unauthenticated request');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Authentication required. Please log in.',
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PARSE REQUEST
  // ──────────────────────────────────────────────────────────────────────────

  let endpoint, method, params;

  try {
    const body = JSON.parse(event.body || '{}');
    endpoint = body.endpoint;
    method = body.method || 'GET';
    params = body.params || null;

    if (!endpoint) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'endpoint required in request body' }),
      };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid request body',
        details: err.message,
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ENDPOINT WHITELIST CHECK
  // ──────────────────────────────────────────────────────────────────────────

  if (!isEndpointAllowed(endpoint)) {
    console.warn(`[kite-proxy] Blocked unauthorized endpoint: ${endpoint} | User: ${user.email}`);
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: 'Endpoint not permitted',
        endpoint: endpoint,
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LOAD CREDENTIALS
  // ──────────────────────────────────────────────────────────────────────────

  const apiKey = process.env.KITE_API_KEY;
  const accessToken = process.env.KITE_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    console.error('[kite-proxy] Kite credentials not configured');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Trading platform not configured',
        action: 'Admin must set KITE_API_KEY and KITE_ACCESS_TOKEN in Netlify environment',
      }),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BUILD & EXECUTE REQUEST
  // ──────────────────────────────────────────────────────────────────────────

  const kiteHeaders = {
    'X-Kite-Version': '3',
    'Authorization': `token ${apiKey}:${accessToken}`,
  };

  let fetchUrl = KITE_BASE + endpoint;
  let fetchOptions = {
    method: method.toUpperCase(),
    headers: kiteHeaders,
  };

  // Handle request body
  if (['POST', 'PUT'].includes(method.toUpperCase()) && params) {
    fetchOptions.body = new URLSearchParams(params).toString();
    fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  console.log(`[kite-proxy] ${method.toUpperCase()} ${endpoint} | User: ${user.email}`);

  try {
    const response = await fetch(fetchUrl, fetchOptions);
    const data = await response.json().catch(() => ({}));

    console.log(`[kite-proxy] Response: ${response.status} | Endpoint: ${endpoint}`);

    // ────────────────────────────────────────────────────────────────────────
    // TOKEN EXPIRATION DETECTION
    // ────────────────────────────────────────────────────────────────────────
    if (response.status === 401 || response.status === 403) {
      if (data.error_type === 'TokenException' || data.error_type === 'AuthenticationException') {
        console.warn(`[kite-proxy] Token expired for ${user.email}`);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            error: 'Token expired — please click Kite Login to re-authenticate',
            kite_error: data.error_type,
            action: 'kite_login_required',
          }),
        };
      }
    }

    // Forward response as-is
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify({
        ok: response.ok,
        status: response.status,
        data: data,
      }),
    };

  } catch (error) {
    console.error(`[kite-proxy] Error: ${error.message}`);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: 'Kite API unreachable',
        details: error.message,
        endpoint: endpoint,
      }),
    };
  }
};