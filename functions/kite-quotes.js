const KITE_BASE = 'https://api.kite.trade';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { symbols = [], api_key, access_token } = body;
  const apiKey    = api_key     || process.env.KITE_API_KEY;
  const accessTok = access_token || process.env.KITE_ACCESS_TOKEN;

  if (!apiKey || !accessTok) {
    return {
      statusCode: 401, headers,
      body: JSON.stringify({ error: 'Missing Kite credentials' }),
    };
  }

  if (!symbols.length) {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'No symbols provided' }),
    };
  }

  // Build i= param: NSE:TCS,NSE:RELIANCE,...
  // Special symbols: indexes use NSE:NIFTY 50, commodities use MCX: prefix
  const INDEX_MAP = {
    'NIFTY50': 'NSE:NIFTY 50',
    'BANKNIFTY': 'NSE:NIFTY BANK',
    'NIFTYMID50': 'NSE:NIFTY MIDCAP 50',
    'SENSEX': 'BSE:SENSEX',
    'NIFTYIT': 'NSE:NIFTY IT',
    'NIFTYFMCG': 'NSE:NIFTY FMCG',
  };
  const MCX_SYMS = ['GOLD','SILVER','CRUDEOIL','NATURALGAS','COPPER','ALUMINIUM','ZINC','LEAD','NICKEL','COTTON'];

  const iParam = symbols.map(s => {
    if (INDEX_MAP[s])       return INDEX_MAP[s];
    if (MCX_SYMS.includes(s)) return `MCX:${s}`;
    return `NSE:${s}`;
  }).join(',');

  try {
    const res = await fetch(
      `${KITE_BASE}/quote?i=${encodeURIComponent(iParam)}`,
      {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${apiKey}:${accessTok}`,
        },
      }
    );

    const json = await res.json();

    if (json.status === 'error') {
      return {
        statusCode: 401, headers,
        body: JSON.stringify({ error: json.message, error_type: json.error_type }),
      };
    }

    // Transform Kite quote format → dashboard format
    const data = {};
    if (json.data) {
      Object.entries(json.data).forEach(([key, q]) => {
        // key = "NSE:TCS" → sym = "TCS"
        const sym = key.split(':')[1]?.replace('NIFTY 50','NIFTY50').replace('NIFTY BANK','BANKNIFTY') || key;
        const prevClose = q.ohlc?.close || q.last_price;
        const change    = prevClose ? ((q.last_price - prevClose) / prevClose) * 100 : 0;

        data[sym] = {
          price:      q.last_price,
          change:     parseFloat(change.toFixed(2)),
          prevClose:  prevClose,
          open:       q.ohlc?.open,
          high:       q.ohlc?.high,
          low:        q.ohlc?.low,
          volume:     q.volume_traded,
          bid:        q.depth?.buy?.[0]?.price,
          ask:        q.depth?.sell?.[0]?.price,
          oi:         q.oi,
          ts:         Date.now(),
        };
      });
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ status: 'success', source: 'kite', data }),
    };

  } catch (err) {
    return {
      statusCode: 502, headers,
      body: JSON.stringify({ error: 'Kite quotes fetch failed', details: err.message }),
    };
  }
};
