// functions/place-order.js — production-safe version
const VALID_EXCHANGES = new Set(['NSE','BSE','NFO','MCX','BFO']);
const VALID_PRODUCTS  = new Set(['MIS','CNC','NRML']);
const VALID_ORDER_TYPES = new Set(['MARKET','LIMIT','SL','SL-M']);
const MAX_QTY_NSE     = 10000;   // hard cap — tune per risk policy
const MAX_QTY_NFO     = 5000;    // lot-size-aware check needed
const MAX_QTY_MCX     = 500;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': process.env.URL||'*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  // ① Auth required
  const user = event.clientContext?.user;
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
const dailyLossLimit = parseFloat(process.env.DAILY_LOSS_LIMIT_PCT || '2'); // 2% default

const posRes = await fetch('https://api.kite.trade/portfolio/positions', {
  headers: { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${tok}` }
});
const posData = await posRes.json();
const dayPnl = (posData.data?.day || []).reduce((sum, p) => sum + (p.pnl || 0), 0);

const marginsRes = await fetch('https://api.kite.trade/user/margins', { ... });
const margins = await marginsRes.json();
const equity = margins.data?.equity?.net || 1;
const lossPct = (dayPnl / equity) * 100;

if (lossPct < -dailyLossLimit) {
  return { statusCode: 429, headers, body: JSON.stringify({
    error: `CIRCUIT_BREAKER: Daily loss limit ${dailyLossLimit}% reached (current: ${lossPct.toFixed(2)}%)`,
    circuit_breaker: true
  })};
  // ② Only admin or allow-listed users can execute orders
  const adminEmail = (process.env.ADMIN_EMAIL||'').toLowerCase();
  if (user.email.toLowerCase() !== adminEmail)
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Order placement: Admin only' }) };

  const body = JSON.parse(event.body||'{}');
  // NEVER accept credentials from body — server-side only:
  const apiKey = process.env.KITE_API_KEY;
  const tok    = process.env.KITE_ACCESS_TOKEN;
  if (!apiKey||!tok) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Platform not configured'}) } };

  const { symbol, exchange='NSE', side, quantity, order_type='MARKET', product='MIS', price=0, trigger_price=0 } = body;

  // ③ Validate all params
  if (!symbol||!side||!quantity) return { statusCode: 400, headers, body: JSON.stringify({ error: 'symbol/side/quantity required' }) };
  if (!VALID_EXCHANGES.has(exchange)) return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid exchange: ${exchange}` }) };
  if (!VALID_PRODUCTS.has(product))   return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid product: ${product}` }) };
  if (!VALID_ORDER_TYPES.has(order_type)) return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid order_type: ${order_type}` }) };
  if (!['BUY','SELL'].includes(side.toUpperCase())) return { statusCode: 400, headers, body: JSON.stringify({ error: 'side: BUY or SELL' }) };
  
  // ④ Quantity circuit breaker
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'quantity must be positive integer' }) };
  const maxQty = exchange==='MCX' ? MAX_QTY_MCX : exchange==='NFO' ? MAX_QTY_NFO : MAX_QTY_NSE;
  if (qty > maxQty) return { statusCode: 400, headers, body: JSON.stringify({ error: `Quantity ${qty} exceeds max ${maxQty} for ${exchange}` }) };

  // ⑤ Proceed to place order (rest of code same as before)
  // ... URLSearchParams build + fetch to Kite ...;