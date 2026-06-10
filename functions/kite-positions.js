// Returns open positions + today's realized P&L from Kite
// GET /.netlify/functions/kite-positions

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const apiKey   = process.env.KITE_API_KEY;
  const apiToken = process.env.KITE_ACCESS_TOKEN;
  if (!apiKey || !apiToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No credentials' }) };

  const [posRes, ordersRes] = await Promise.all([
    fetch('https://api.kite.trade/portfolio/positions', {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${apiToken}` }
    }),
    fetch('https://api.kite.trade/orders', {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${apiToken}` }
    })
  ]);

  const positions = await posRes.json();
  const orders    = await ordersRes.json();

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      net:   positions.data?.net   || [],
      day:   positions.data?.day   || [],
      orders: orders.data || [],
    })
  };
};