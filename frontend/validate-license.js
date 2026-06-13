// netlify/functions/validate-license.js
// Validates a license key submitted by the user on first install.
// Set VALID_LICENSE_KEYS in Netlify env vars as a comma-separated list.
// E.g.:  VALID_LICENSE_KEYS=KEY-ALPHA-001,KEY-BETA-002,KEY-GAMMA-003

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

  let licenseKey, userEmail;
  try {
    ({ licenseKey, userEmail } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!licenseKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'License key required' }) };
  }

  // Load valid keys from env (admin sets these in Netlify dashboard)
  const validKeys = (process.env.VALID_LICENSE_KEYS || '')
    .split(',')
    .map(k => k.trim().toUpperCase())
    .filter(Boolean);

  const normalized = licenseKey.trim().toUpperCase();

  if (validKeys.length === 0) {
    // No keys configured — log and reject (never auto-approve)
    console.error('VALID_LICENSE_KEYS env var not set. All license requests denied.');
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ valid: false, error: 'License system not configured. Contact admin.' })
    };
  }

  const isValid = validKeys.includes(normalized);

  if (isValid) {
    console.log(`License APPROVED: ${normalized} | User: ${userEmail || 'unknown'} | Time: ${new Date().toISOString()}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        message: 'License activated successfully.',
        // Return a server-signed token that the client stores
        // This is a simple HMAC-free token; for production add HMAC signing
        activatedAt: new Date().toISOString(),
        key: normalized,
      })
    };
  } else {
    console.warn(`License REJECTED: ${normalized} | User: ${userEmail || 'unknown'} | Time: ${new Date().toISOString()}`);
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ valid: false, error: 'Invalid license key. Contact admin for a valid key.' })
    };
  }
};
