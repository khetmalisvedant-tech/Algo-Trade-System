const express = require('express');
const { KiteConnect, KiteTicker } = require('kiteconnect');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(require('cors')({ origin: process.env.FRONTEND_URL || 'http://strategytradingsystemindia.netlify.app/' }));
app.use(express.json());

// ── Subscription registry ──
let subscribedTokens = new Set();
let ticker = null;
let tickerReady = false;

function startTicker(accessToken) {
  if (ticker) { try { ticker.disconnect(); } catch(e){} }
  tickerReady = false;

  ticker = new KiteTicker({
    api_key: process.env.KITE_API_KEY,
    access_token: accessToken,
  });

  ticker.connect();
  
  ticker.on('connect', () => {
    console.log('[Ticker] Connected');
    tickerReady = true;
    if (subscribedTokens.size > 0) {
      ticker.subscribe([...subscribedTokens]);
      ticker.setMode(ticker.modeFull, [...subscribedTokens]);
    }
  });

  ticker.on('ticks', (ticks) => {
    const msg = JSON.stringify({ type: 'ticks', data: ticks });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
  });

  ticker.on('error', (err) => {
    console.error('[Ticker] Error:', err);
    tickerReady = false;
  });

  ticker.on('disconnect', (code, reason) => {
    console.warn(`[Ticker] Disconnected (${code}): ${reason}`);
    tickerReady = false;
    // Attempt reconnect in 5s (token may have been refreshed by then)
    setTimeout(() => {
      const tok = process.env.KITE_ACCESS_TOKEN;
      if (tok) startTicker(tok);
    }, 5000);
  });
}

// ── Token refresh endpoint (called by save-token after daily OAuth) ──
app.post('/token', (req, res) => {
  const { access_token, secret } = req.body;
  if (secret !== process.env.INTERNAL_SECRET) return res.status(403).json({ error: 'Forbidden' });
  process.env.KITE_ACCESS_TOKEN = access_token;
  startTicker(access_token);
  res.json({ ok: true });
});

// ── Dynamic subscription ──
app.post('/subscribe', (req, res) => {
  const { tokens, mode = 'full' } = req.body;
  if (!Array.isArray(tokens)) return res.status(400).json({ error: 'tokens array required' });
  tokens.forEach(t => subscribedTokens.add(Number(t)));
  if (tickerReady) {
    ticker.subscribe(tokens.map(Number));
    ticker.setMode(mode === 'full' ? ticker.modeFull : ticker.modeLTP, tokens.map(Number));
  }
  res.json({ ok: true, subscribed: [...subscribedTokens] });
});

app.post('/unsubscribe', (req, res) => {
  const { tokens } = req.body;
  tokens.forEach(t => subscribedTokens.delete(Number(t)));
  if (tickerReady) ticker.unsubscribe(tokens.map(Number));
  res.json({ ok: true });
});

app.get('/', (_, res) => res.json({ status: 'ok', subscriptions: subscribedTokens.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] Listening on ${PORT}`);
  const tok = process.env.KITE_ACCESS_TOKEN;
  if (tok) startTicker(tok);
  else console.warn('[Server] No KITE_ACCESS_TOKEN — waiting for /token endpoint');
});
// GET /instrument?sym=NSE:RELIANCE
app.get('/instrument', (req, res) => {
  const sym = req.query.sym;
  if (!sym) return res.status(400).json({ error: 'sym required' });
  const token = resolveToken(sym);
  if (!token) return res.status(404).json({ error: 'Symbol not found' });
  res.json({ sym, token });
});

// GET /instruments/search?q=NIFTY&exchange=NFO
app.get('/instruments/search', (req, res) => {
  const { q, exchange = 'NSE' } = req.query;
  const map = exchangeTokenMap[exchange];
  if (!map) return res.status(400).json({ error: 'Unknown exchange' });
  const results = [];
  for (const [sym, token] of map) {
    if (sym.includes(q.toUpperCase())) results.push({ sym, token });
    if (results.length >= 50) break;
  }
  res.json({ results });
});