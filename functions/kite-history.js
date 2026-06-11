// Returns OHLCV candle history for a symbol and timeframe
// GET /.netlify/functions/kite-history?sym=NSE:RELIANCE&interval=5minute&days=2

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const apiKey   = process.env.KITE_API_KEY;
  const apiToken = process.env.KITE_ACCESS_TOKEN;
  if (!apiKey || !apiToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No credentials' }) };

  const { sym, interval = '5minute', days = '2' } = event.queryStringParameters || {};
  if (!sym) return { statusCode: 400, headers, body: JSON.stringify({ error: 'sym required' }) };

  // Kite historical API needs instrument_token, not trading symbol.
  // Step 1: fetch the instrument list to resolve the token.
  // Cache this: the instrument list is ~2MB but changes rarely.
  const [exchange, ...rest] = sym.split(':');
  const tradingSymbol = rest.join(':');

  try {
    const instrRes = await fetch(`https://api.kite.trade/instruments/${exchange}`, {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${apiToken}` }
    });
    const csv = await instrRes.text();
    const lines = csv.split('\n').slice(1); // skip header
    let token = null;
    for (const line of lines) {
      const [instrToken,,tsym] = line.split(',');
      if (tsym === tradingSymbol) { token = instrToken; break; }
    }
    if (!token) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Symbol not found in instruments' }) };

    // Step 2: fetch historical candles
    const to   = new Date();
    const from = new Date(to - parseInt(days) * 86400000);
    const fmt  = d => d.toISOString().slice(0, 19).replace('T', ' ');

    const url = `https://api.kite.trade/instruments/historical/${token}/${interval}`
                + `?from=${encodeURIComponent(fmt(from))}&to=${encodeURIComponent(fmt(to))}&continuous=0`;

    const histRes = await fetch(url, {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${apiToken}` }
    });
    const data = await histRes.json();

    // data.data.candles = [[timestamp, open, high, low, close, volume], ...]
    const candles = (data.data?.candles || []).map(([t, o, h, l, c, v]) => ({
      t: new Date(t).toISOString(), o, h, l, c, v
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ candles }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};