// backend/server.js — PRODUCTION VERSION
// WebSocket ticker server with token refresh, error handling, and real-time subscriptions

const express = require('express');
const { KiteConnect, KiteTicker } = require('kiteconnect');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 3000;
const KITE_API_KEY = process.env.KITE_API_KEY;
const KITE_ACCESS_TOKEN = process.env.KITE_ACCESS_TOKEN;

// Validate required env vars
if (!KITE_API_KEY) {
  console.error('[ERROR] KITE_API_KEY not set in environment');
  process.exit(1);
}

app.use(require('cors')({ origin: FRONTEND_URL }));
app.use(express.json());

// ────────────────────────────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────────────────────────────
let subscribedTokens = new Set();
let ticker = null;
let tickerReady = false;
let lastTokenRefresh = Date.now();

// Load instruments on startup
const { exchangeTokenMap } = require('./instruments');
let instrumentsLoaded = false;

// ────────────────────────────────────────────────────────────────────────
// LOGGING UTILITIES
// ────────────────────────────────────────────────────────────────────────
function log(level, component, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, component, message, ...data };
  console.log(`[${timestamp}] [${level}] [${component}] ${message}`, Object.keys(data).length > 0 ? JSON.stringify(data) : '');
}

// ────────────────────────────────────────────────────────────────────────
// TICKER MANAGEMENT
// ────────────────────────────────────────────────────────────────────────

function startTicker(accessToken) {
  if (!accessToken) {
    log('error', 'Ticker', 'Cannot start ticker without access token');
    return;
  }

  // Disconnect existing ticker gracefully
  if (ticker) {
    try {
      ticker.disconnect();
      log('info', 'Ticker', 'Previous ticker disconnected');
    } catch (e) {
      log('warn', 'Ticker', 'Error disconnecting previous ticker', { error: e.message });
    }
  }

  tickerReady = false;
  lastTokenRefresh = Date.now();

  ticker = new KiteTicker({
    api_key: KITE_API_KEY,
    access_token: accessToken,
  });

  // ── CONNECT ──
  ticker.connect();

  ticker.on('connect', () => {
    log('info', 'Ticker', 'Connected to Zerodha');
    tickerReady = true;

    if (subscribedTokens.size > 0) {
      const tokens = Array.from(subscribedTokens);
      try {
        ticker.subscribe(tokens);
        ticker.setMode(ticker.modeFull, tokens);
        log('info', 'Ticker', `Resubscribed to ${tokens.length} instruments`, { tokens });
      } catch (e) {
        log('error', 'Ticker', 'Failed to subscribe after connect', { error: e.message });
      }
    }
  });

  // ── TICKS ──
  ticker.on('ticks', (ticks) => {
    if (!ticks || ticks.length === 0) return;

    const msg = JSON.stringify({
      type: 'ticks',
      timestamp: new Date().toISOString(),
      count: ticks.length,
      data: ticks,
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (e) {
          log('warn', 'WebSocket', 'Failed to send ticks to client', { error: e.message });
        }
      }
    });
  });

  // ── ERROR ──
  ticker.on('error', (err) => {
    log('error', 'Ticker', 'Ticker error', { error: err.message || err });
    tickerReady = false;
    
    // Notify all clients
    const msg = JSON.stringify({
      type: 'error',
      message: 'Market feed error: ' + (err.message || 'Unknown error'),
      timestamp: new Date().toISOString(),
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (e) {
          // Silent fail
        }
      }
    });
  });

  // ── DISCONNECT ──
  ticker.on('disconnect', (code, reason) => {
    log('warn', 'Ticker', `Disconnected (${code}): ${reason}`);
    tickerReady = false;

    // Auto-reconnect in 5s
    setTimeout(() => {
      const tok = process.env.KITE_ACCESS_TOKEN;
      if (tok) {
        log('info', 'Ticker', 'Attempting reconnection...');
        startTicker(tok);
      } else {
        log('warn', 'Ticker', 'No token available for reconnect');
      }
    }, 5000);
  });

  // ── NO REAUTH (Zerodha doesn't provide refresh tokens) ──
  // Users must re-login daily via OAuth
}

// ────────────────────────────────────────────────────────────────────────
// HTTP ENDPOINTS
// ────────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    ticker_ready: tickerReady,
    subscribed_instruments: subscribedTokens.size,
    connected_clients: wss.clients.size,
    instruments_loaded: instrumentsLoaded,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Token refresh endpoint (called by save-token.js after OAuth)
app.post('/token', (req, res) => {
  const { access_token, secret } = req.body;
  const internalSecret = process.env.INTERNAL_SECRET;

  if (!internalSecret || secret !== internalSecret) {
    log('warn', 'Auth', 'Invalid internal secret for token refresh');
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!access_token) {
    log('warn', 'Auth', 'Token refresh called without access_token');
    return res.status(400).json({ error: 'access_token required' });
  }

  // Update env var
  process.env.KITE_ACCESS_TOKEN = access_token;
  
  // Restart ticker with new token
  startTicker(access_token);
  
  log('info', 'Auth', 'Token refreshed and ticker restarted');
  res.json({ ok: true, message: 'Token updated and ticker reconnected' });
});

// Subscribe to instruments
app.post('/subscribe', (req, res) => {
  const { tokens, mode = 'full' } = req.body;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'tokens array required' });
  }

  const numTokens = tokens.length;
  tokens.forEach((t) => {
    subscribedTokens.add(Number(t));
  });

  if (tickerReady) {
    try {
      const numericTokens = tokens.map(Number);
      ticker.subscribe(numericTokens);
      
      const modeObj = mode === 'full' ? ticker.modeFull : ticker.modeLTP;
      ticker.setMode(modeObj, numericTokens);
      
      log('info', 'Subscribe', `Subscribed to ${numTokens} instruments`, { mode });
    } catch (e) {
      log('error', 'Subscribe', 'Failed to subscribe', { error: e.message });
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({
    ok: true,
    subscribed_count: numTokens,
    total_subscriptions: subscribedTokens.size,
    ticker_ready: tickerReady,
  });
});

// Unsubscribe from instruments
app.post('/unsubscribe', (req, res) => {
  const { tokens } = req.body;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'tokens array required' });
  }

  tokens.forEach((t) => {
    subscribedTokens.delete(Number(t));
  });

  if (tickerReady) {
    try {
      ticker.unsubscribe(tokens.map(Number));
      log('info', 'Unsubscribe', `Unsubscribed from ${tokens.length} instruments`);
    } catch (e) {
      log('warn', 'Unsubscribe', 'Unsubscribe failed (ignoring)', { error: e.message });
    }
  }

  res.json({
    ok: true,
    unsubscribed_count: tokens.length,
    remaining_subscriptions: subscribedTokens.size,
  });
});

// Get instrument token by symbol
app.get('/instrument', (req, res) => {
  const { sym } = req.query;
  if (!sym) {
    return res.status(400).json({ error: 'sym query param required (e.g., NSE:RELIANCE)' });
  }

  const { resolveToken } = require('./instruments');
  const token = resolveToken(sym);

  if (!token) {
    return res.status(404).json({ error: `Symbol not found: ${sym}` });
  }

  res.json({ sym, token });
});

// Search instruments by partial name
app.get('/instruments/search', (req, res) => {
  const { q, exchange = 'NSE' } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'q (search query) required' });
  }

  const map = exchangeTokenMap[exchange.toUpperCase()];
  if (!map) {
    return res.status(400).json({ error: `Unknown exchange: ${exchange}` });
  }

  const results = [];
  const query = q.toUpperCase();

  for (const [sym, token] of map) {
    if (sym.includes(query)) {
      results.push({ sym, token, exchange });
      if (results.length >= 50) break;
    }
  }

  res.json({
    query: q,
    exchange,
    count: results.length,
    results,
  });
});

// Load instruments (admin endpoint)
app.post('/instruments/load', async (req, res) => {
  const secret = req.query.secret || req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { loadInstruments } = require('./instruments');
    await loadInstruments();
    instrumentsLoaded = true;
    log('info', 'Instruments', 'Instruments loaded successfully');
    res.json({ ok: true, message: 'Instruments loaded' });
  } catch (e) {
    log('error', 'Instruments', 'Failed to load instruments', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────────────────
// WEBSOCKET
// ────────────────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  const clientId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  log('info', 'WebSocket', 'Client connected', { clientId, total_clients: wss.clients.size });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to market feed',
    ticker_ready: tickerReady,
    subscribed: Array.from(subscribedTokens),
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      log('debug', 'WebSocket', 'Message received', { clientId, type: data.type });

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      log('warn', 'WebSocket', 'Invalid message', { clientId, error: e.message });
    }
  });

  ws.on('error', (err) => {
    log('error', 'WebSocket', 'Client error', { clientId, error: err.message });
  });

  ws.on('close', () => {
    log('info', 'WebSocket', 'Client disconnected', { clientId, remaining: wss.clients.size - 1 });
  });
});

// ────────────────────────────────────────────────────────────────────────
// STARTUP
// ────────────────────────────────────────────────────────────────────────

async function startup() {
  log('info', 'Server', 'Starting up...');

  // Load instruments
  try {
    const { loadInstruments } = require('./instruments');
    await loadInstruments();
    instrumentsLoaded = true;
    log('info', 'Instruments', 'Loaded successfully');
  } catch (e) {
    log('error', 'Instruments', 'Failed to load', { error: e.message });
  }

  // Start ticker if token available
  if (KITE_ACCESS_TOKEN) {
    log('info', 'Ticker', 'Starting with available token...');
    startTicker(KITE_ACCESS_TOKEN);
  } else {
    log('warn', 'Ticker', 'No KITE_ACCESS_TOKEN — waiting for /token endpoint');
  }

  // Start HTTP server
  server.listen(PORT, () => {
    log('info', 'Server', `Listening on port ${PORT}`, { port: PORT });
  });
}

startup().catch((err) => {
  log('error', 'Startup', 'Fatal error', { error: err.message });
  process.exit(1);
});

// ────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ────────────────────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  log('info', 'Server', 'SIGTERM received, shutting down gracefully...');

  if (ticker) {
    try {
      ticker.disconnect();
      log('info', 'Ticker', 'Disconnected');
    } catch (e) {
      log('error', 'Ticker', 'Error disconnecting', { error: e.message });
    }
  }

  wss.clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down');
  });

  server.close(() => {
    log('info', 'Server', 'HTTP server closed');
    process.exit(0);
  });

  // Force exit after 30s
  setTimeout(() => {
    log('error', 'Server', 'Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

module.exports = server;