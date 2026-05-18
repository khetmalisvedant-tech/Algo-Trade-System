// netlify/functions/kite-proxy.js
// Proxies Zerodha Kite API calls on behalf of regular (non-admin) users.
// Regular users NEVER see the API key — it lives securely in Netlify env vars.
//
// Set these in Netlify → Project config → Environment variables:
//   KITE_API_KEY      = your Zerodha API key
//   KITE_ACCESS_TOKEN = your current Zerodha access token
//                       (update this daily — Kite tokens expire each day)
//
// The access token changes every day after you log in via Kite Connect.
// Easiest workflow: log in once as admin each morning and it updates automatically
// (see connectZerodha() in dashboard.html which stores the token via save-token function).

const KITE_BASE = 'https://api.kite.trade';

// Endpoints we allow proxying — whitelist for security
const ALLOWED_ENDPOINTS = [
  '/user/profile',
  '/quote',
  '/orders/regular',
  '/positions',
  '/holdings',
  '/margins',
  '/instruments/NFO',
];

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Only allow logged-in Identity users
  const context = event.clientContext;
  const user = context && context.user;
  if (!user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required. Please log in.' }),
    };
  }

  let endpoint, method, params;
  try {
    ({ endpoint, method = 'GET', params = null } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'endpoint required' }) };
  }

  // Security: only allow whitelisted endpoints
  const baseEndpoint = endpoint.split('?')[0];
  const isAllowed = ALLOWED_ENDPOINTS.some(allowed => baseEndpoint.startsWith(allowed));
  if (!isAllowed) {
    console.warn(`Blocked endpoint attempt: ${endpoint} by ${user.email}`);
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Endpoint not permitted' }),
    };
  }

  const apiKey = process.env.KITE_API_KEY;
  const accessToken = process.env.KITE_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    console.warn('Kite credentials not configured in env vars');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Platform API not configured. Admin needs to set KITE_API_KEY and KITE_ACCESS_TOKEN.',
        status: 'error',
      }),
    };
  }

  const kiteHeaders = {
    'X-Kite-Version': '3',
    'Authorization': `token ${apiKey}:${accessToken}`,
  };

  try {
    let url = KITE_BASE + endpoint;
    let fetchOptions = { method: method || 'GET', headers: kiteHeaders };

    if (method === 'POST' && params) {
      fetchOptions.body = new URLSearchParams(params).toString();
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const res = await fetch(url, fetchOptions);
    const data = await res.json();

    console.log(`Kite proxy: ${method} ${endpoint} → ${res.status} | user: ${user.email}`);

    return {
      statusCode: res.status,
      headers,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('Kite proxy error:', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Kite API unreachable: ' + err.message, status: 'error' }),
    };
  }
};
