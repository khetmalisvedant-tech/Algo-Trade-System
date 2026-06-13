exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  
  // Only admin (verified by clientContext) can save credentials
  const user = event.clientContext?.user;
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
  
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (user.email.toLowerCase() !== adminEmail)
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
  
  // GET — return stored status (never return actual keys)
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({
      hasApiKey: !!process.env.KITE_API_KEY,
      hasSecret: !!process.env.KITE_API_SECRET,
      hasToken: !!process.env.KITE_ACCESS_TOKEN,
    })};
  }
  
  // POST — update via Netlify env API
  const { api_key, api_secret } = JSON.parse(event.body || '{}');
  const netlifyToken = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  
  if (!netlifyToken || !siteId)
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'NETLIFY_API_TOKEN not set' }) };
  
  const updates = [];
  if (api_key) updates.push({ key: 'KITE_API_KEY', values: [{ context: 'all', value: api_key }] });
  if (api_secret) updates.push({ key: 'KITE_API_SECRET', values: [{ context: 'all', value: api_secret }] });
  
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/env`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${netlifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return { statusCode: res.ok ? 200 : 500, headers, 
    body: JSON.stringify({ ok: res.ok, saved: updates.map(u => u.key) }) };
};