// Real-time quote fetcher from Kite API
// POST /.netlify/functions/kite-quotes
// Body: { symbols: ['NSE:RELIANCE', 'NSE:INFY', 'MCX:GOLD', ...] }

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const apiKey = process.env.KITE_API_KEY;
  const apiToken = process.env.KITE_ACCESS_TOKEN;
  if (!apiKey || !apiToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No Kite credentials' }) };
  }

  let symbols = [];
  try {
    const body = JSON.parse(event.body || '{}');
    symbols = body.symbols || [];
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!symbols.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbols array required' }) };
  }

  // Kite quote API endpoint
  const url = `https://api.kite.trade/quote?i=${symbols.join(',')}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${apiToken}`
      }
    });

    const json = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify({ error: json.message || 'Kite API error', kite: json }) };
    }

    // Normalize: extract price, change%, volume, OHLC from Kite response
    const out = {};
    for (const [key, d] of Object.entries(json.data || {})) {
      const sym = key.split(':')[1]; // strip "NSE:" prefix for dashboard lookup
      out[sym] = {
        price:     d.last_price,
        open:      d.ohlc?.open,
        high:      d.ohlc?.high,
        low:       d.ohlc?.low,
        close:     d.ohlc?.close,
        prevClose: d.ohlc?.close,
        volume:    d.volume,
        change:    d.net_change,       // absolute change
        changePct: d.last_price && d.ohlc?.close
                   ? parseFloat(((d.last_price - d.ohlc.close) / d.ohlc.close * 100).toFixed(2))
                   : 0,
        oi:        d.oi || 0,
        oi_change: d.oi_day_change || 0,
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: out }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};