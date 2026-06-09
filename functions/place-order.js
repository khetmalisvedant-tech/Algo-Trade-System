/**
 * /.netlify/functions/place-order
 *
 * Places a real order on Zerodha Kite API (server-side, credentials never exposed).
 *
 * Request (POST):
 *   {
 *     "api_key": "...",
 *     "access_token": "...",
 *     "symbol": "TCS",
 *     "exchange": "NSE",           // NSE | BSE | NFO | MCX
 *     "side": "BUY",               // BUY | SELL
 *     "quantity": 1,
 *     "order_type": "MARKET",      // MARKET | LIMIT | SL | SL-M
 *     "product": "MIS",            // MIS (intraday) | CNC (delivery) | NRML (F&O)
 *     "price": 0,                  // required for LIMIT / SL
 *     "trigger_price": 0,          // required for SL / SL-M
 *     "tag": "algorigin"           // optional order tag for tracking
 *   }
 *
 * Response (success):
 *   { "status": "success", "order_id": "250609000123456" }
 *
 * Response (error):
 *   { "error": "Insufficient funds", "error_type": "OrderException" }
 */

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    api_key, access_token,
    symbol, exchange = 'NSE', side, quantity,
    order_type = 'MARKET', product = 'MIS',
    price, trigger_price, tag = 'algorigin',
  } = body;

  const apiKey    = api_key     || process.env.KITE_API_KEY;
  const accessTok = access_token || process.env.KITE_ACCESS_TOKEN;

  // ── Validate ──
  if (!apiKey || !accessTok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing Kite credentials' }) };
  }
  if (!symbol || !side || !quantity) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbol, side, and quantity are required' }) };
  }
  if (!['BUY','SELL'].includes(side.toUpperCase())) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'side must be BUY or SELL' }) };
  }

  // ── Build form-urlencoded body for Kite ──
  const params = new URLSearchParams({
    variety:          'regular',
    tradingsymbol:    symbol.toUpperCase(),
    exchange:         exchange.toUpperCase(),
    transaction_type: side.toUpperCase(),
    order_type:       order_type.toUpperCase(),
    product:          product.toUpperCase(),
    quantity:         String(quantity),
    tag,
  });

  if (order_type.toUpperCase() === 'LIMIT' && price) {
    params.append('price', String(price));
  }
  if (['SL','SL-M'].includes(order_type.toUpperCase()) && trigger_price) {
    params.append('trigger_price', String(trigger_price));
    if (order_type.toUpperCase() === 'SL' && price) params.append('price', String(price));
  }

  try {
    const res = await fetch(`${KITE_BASE}/orders/regular`, {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessTok}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const json = await res.json();

    if (json.status === 'error') {
      return {
        statusCode: res.status, headers,
        body: JSON.stringify({ error: json.message, error_type: json.error_type }),
      };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ status: 'success', order_id: json.data?.order_id }),
    };

  } catch (err) {
    return {
      statusCode: 502, headers,
      body: JSON.stringify({ error: 'Order placement failed', details: err.message }),
    };
  }
};
