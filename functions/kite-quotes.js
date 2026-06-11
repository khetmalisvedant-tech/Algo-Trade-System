// functions/kite-quotes.js
// Real-time quote fetcher from Kite API.
// Token resolution order:
//   1. KITE_ACCESS_TOKEN env var (set automatically after login)
//   2. Fetch from save-token function (in-memory cache from last login)
//   3. 401 — user needs to click Kite Login

const KITE_BASE = 'https://api.kite.trade';

async function resolveToken(apiKey) {
  // 1. env var (fastest)
  if (process.env.KITE_ACCESS_TOKEN) return process.env.KITE_ACCESS_TOKEN;

  // 2. ask save-token for its cached token
  try {
    const res = await fetch(`${process.env.URL || 'http://localhost:8888'}/.netlify/functions/save-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.access_token) return data.access_token;
    }
  } catch (e) {
    console.warn('Could not reach save-token:', e.message);
  }

  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'KITE_API_KEY not configured in Netlify env vars' }) };
  }

  const accessToken = await resolveToken(apiKey);
  if (!accessToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No Kite access token — click Kite Login to authenticate' }) };
  }

  let symbols = [];
  try {
    const body = JSON.parse(event.body || '{}');
    symbols = body.symbols || [];
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!symbols.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbols array required' }) };
  }

  const url = `${KITE_BASE}/quote?i=${symbols.map(encodeURIComponent).join('&i=')}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      // Token expired — clear env var hint
      if (res.status === 403 || (json.error_type === 'TokenException')) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Token expired — click Kite Login to refresh', kite: json }),
        };
      }
      return { statusCode: res.status, headers, body: JSON.stringify({ error: json.message || 'Kite API error', kite: json }) };
    }

    // Normalize response
    const out = {};
    for (const [key, d] of Object.entries(json.data || {})) {
      const sym = key.split(':')[1];
      out[sym] = {
        price:     d.last_price,
        open:      d.ohlc?.open,
        high:      d.ohlc?.high,
        low:       d.ohlc?.low,
        close:     d.ohlc?.close,
        prevClose: d.ohlc?.close,
        volume:    d.volume,
        change:    d.net_change,
        changePct: d.last_price && d.ohlc?.close
          ? parseFloat(((d.last_price - d.ohlc.close) / d.ohlc.close * 100).toFixed(2))
          : 0,
        oi:        d.oi || 0,
        oi_change: d.oi_day_change || 0,
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', data: out }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};