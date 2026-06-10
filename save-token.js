// Handle Kite redirect: GET /.netlify/functions/save-token?request_token=XXX&action=string
// Kite sends: ?request_token=XXX&action=login&status=success

if (event.httpMethod === 'GET' && event.queryStringParameters?.request_token) {
  const requestToken = event.queryStringParameters.request_token;
  const apiKey    = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET; // add this to env vars!

  // Generate checksum: sha256(api_key + request_token + api_secret)
  const crypto = require('crypto');
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
    })
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.data?.access_token;

  if (accessToken) {
    // Save to Netlify env var
    await updateNetlifyEnv('KITE_ACCESS_TOKEN', accessToken);
    // Redirect back to dashboard
    return { statusCode: 302, headers: { Location: '/dashboard.html?kite=connected' } };
  }
}