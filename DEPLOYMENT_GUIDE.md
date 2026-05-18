# RSI Algo Trader — Deployment Guide (v3)
## Admin-only API · License Gate · Nifty 50 + Index + Options · 5 Strategies

---

## What's in v3

| Feature | Details |
|---------|---------|
| **Admin-only API key** | Only YOU see and enter the API key. Regular users connect through your key automatically — no prompts for them |
| **Platform API proxy** | Your Kite credentials live securely in Netlify env vars. Regular users call `/.netlify/functions/kite-proxy` which forwards to Zerodha using your key |
| **Token auto-save** | When you connect as admin, your access token is pushed to the server automatically — no need to update env vars daily (with optional Netlify API integration) |
| **License gate** | Users must enter a license key before they can even log in |
| **Nifty Index tab** | 10 NSE indices: NIFTY 50, BANKNIFTY, FINNIFTY, MIDCAP, IT, Pharma, Auto, FMCG, Energy, Realty |
| **Options tab** | NIFTY & BANKNIFTY weekly CE/PE options with IV, Delta, Theta, OI metrics |
| **5 strategies** | S1 RSI · S2 EMA(44)+BB · S3 MACD · S4 RSI+MACD Combined · S5 VWAP+Stochastic |
| **5 strategy guides** | In-app guide modal explains every strategy — rules, formulas, best conditions |
| **Extra indicators** | ADX (trend strength), Stochastic, VWAP shown as metrics on all instruments |

---

## File Structure

```
rsi-trader-deploy/
├── public/
│   ├── index.html              — License gate + Login (public)
│   └── dashboard.html          — Trading dashboard (protected)
├── netlify/
│   └── functions/
│       ├── validate-license.js — Validates license keys against env var
│       ├── request-access.js   — Notifies admin when someone requests access
│       ├── is-admin.js         — NEW: checks if logged-in user is the admin
│       ├── kite-proxy.js       — NEW: proxies Kite API for regular users
│       └── save-token.js       — NEW: admin pushes daily token to server
└── netlify.toml                — Netlify config
```

---

## Step 1 — Deploy to Netlify

1. Go to app.netlify.com
2. Add new site → Deploy manually
3. Drag and drop the entire `rsi-trader-deploy` folder
4. You get a live URL instantly

---

## Step 2 — Enable Netlify Identity

1. Project configuration → Identity → Enable Identity
2. Set Registration to **"Invite only"**
3. Invite yourself first (use the email you'll set as ADMIN_EMAIL)

---

## Step 3 — Set Environment Variables (CRITICAL)

Go to **Project configuration → Environment variables** and add all of these:

| Variable | Value | Purpose |
|----------|-------|---------|
| `VALID_LICENSE_KEYS` | `KEY-ALPHA-2024,KEY-BETA-2024` | Comma-separated license keys to distribute to users |
| `ADMIN_EMAIL` | `you@email.com` | Your email — grants admin API access in dashboard |
| `KITE_API_KEY` | *(your Zerodha API key)* | Used by kite-proxy for regular users |
| `KITE_ACCESS_TOKEN` | *(your daily access token)* | Updated daily — see Daily Token Refresh below |
| `NETLIFY_SITE_ID` | *(from Site settings → General)* | **Optional** — enables auto-token save |
| `NETLIFY_API_TOKEN` | *(from app.netlify.com/user/applications)* | **Optional** — enables auto-token save |

After saving, click **Redeploy** (or push any change to trigger a deploy).

---

## Step 4 — How the Admin vs User flow works

```
ADMIN (you):
  → Logs in → sees "Zerodha Kite API" section in sidebar
  → Enters API Key + Access Token → clicks Connect
  → On success: token is pushed to server automatically
  → Regular users will now use your Kite connection transparently

REGULAR USERS:
  → Enter license key → logs in → see "Platform API" status (no API key prompt)
  → Platform API connects using your stored credentials
  → They trade, see charts, use strategies — all via your Kite account
  → They NEVER see your API key or access token
```

---

## Step 5 — Daily Token Refresh (IMPORTANT)

Zerodha access tokens expire every day at midnight. You need to refresh daily:

### Option A — Auto-save (recommended, requires env vars set above)
1. Log in to your site as admin each morning
2. Enter your API Key + fresh Access Token → click Connect
3. Token is automatically pushed to Netlify env vars
4. Regular users get live data immediately

### Option B — Manual update
1. Get fresh access token from Kite Connect login
2. Go to Netlify → Environment variables
3. Update `KITE_ACCESS_TOKEN`
4. Redeploy (takes ~30 seconds)

### Getting your daily access token (Kite Connect):
1. Visit: `https://kite.zerodha.com/connect/login?v=3&api_key=YOUR_API_KEY`
2. Log in with Zerodha credentials
3. Extract `request_token` from the redirect URL
4. Exchange it via Kite API for `access_token` (use Kite's postman or your own script)

---

## Step 6 — Auto-trading setup

1. Admin connects Kite API (Step 4 above)
2. Select stock/option from Watchlist
3. Choose a strategy (S1–S5)
4. Enable **"Auto-execute trades"** toggle
5. System will automatically place BUY/SELL orders on the selected instrument

**Note:** Only the currently selected stock gets auto-traded. All others are monitored but orders are only logged, not executed.

---

## Managing Users

| Action | How |
|--------|-----|
| Give a user access | Add a key to `VALID_LICENSE_KEYS`, redeploy, send them the key |
| Invite a user to login | Netlify → Identity → Users → Invite user |
| Revoke a key | Remove it from `VALID_LICENSE_KEYS`, redeploy |
| Remove dashboard access | Delete user from Netlify Identity → Users |
| Change admin | Update `ADMIN_EMAIL` env var, redeploy |

---

## Strategy Summary

| Strategy | Indicators | Best For |
|----------|-----------|---------|
| S1 · RSI Momentum | RSI(14) | Trending Nifty stocks, index momentum |
| S2 · EMA(44) + BB | EMA(44) + Bollinger Bands | Options, swing entries in uptrend |
| S3 · MACD Crossover | MACD(12,26,9) | Medium-term index options |
| S4 · RSI + MACD Combined | RSI + MACD dual confirm | High-value NIFTY options, fewer/better signals |
| S5 · VWAP + Stochastic | VWAP + Stoch(%K/%D) | Intraday NIFTY/BANKNIFTY index & options |

All strategies support: Trailing Stop Loss · Configurable parameters · Real-time scanning · Auto-order execution

---

## Security Notes

- Regular users can never access your API key — it never leaves the server
- `kite-proxy` only proxies whitelisted endpoints (quote, orders, profile, positions)
- `save-token` is admin-only (checked via Netlify Identity JWT)
- `is-admin` check uses Netlify's built-in JWT injection — cannot be spoofed from the browser
- License keys are validated server-side — client-side tampering doesn't help

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Regular users see "API not configured" | Set `KITE_API_KEY` and `KITE_ACCESS_TOKEN` in env vars and redeploy |
| "Token may be expired" warning | Refresh your access token (Step 5) |
| Admin panel not showing | Check `ADMIN_EMAIL` exactly matches your Netlify Identity email |
| License validation fails | Check `VALID_LICENSE_KEYS` env var is set and redeployed |
| Auto-trade not working | Admin must connect Kite first each day; auto-trade requires live connection |
