# RSI Algo Trader — Deployment Guide (v2)
## Auto-Trading + License-Gated Access Control

---

## What's new in v2

| Feature | Details |
|---------|---------|
| **License gate** | Users must enter a license key you control before they can even log in |
| **One-time per device** | License is stored locally — users are not asked again until they log out |
| **Logout clears license** | Logging out removes the stored key, forcing re-entry on next visit |
| **Auto-trading** | When enabled, RSI signals on the selected stock automatically place real Zerodha Kite orders |
| **Auto-trade target** | Only the stock the user has selected in the watchlist gets auto-traded |
| **Session stats** | Auto-trade panel shows buy/sell order counts for the session |

---

## Step 1 — Deploy to Netlify

1. Go to app.netlify.com
2. Add new site → Deploy manually
3. Drag and drop the entire rsi-trader-deploy folder
4. You get a live URL instantly

---

## Step 2 — Enable Netlify Identity

1. Project configuration → Identity → Enable Identity
2. Set Registration to "Invite only"
3. Invite yourself first to test

---

## Step 3 — Set your license keys (CRITICAL)

1. Go to Project configuration → Environment variables
2. Add:
   - Key: VALID_LICENSE_KEYS
   - Value: comma-separated keys you choose, e.g. KEY-ALPHA-2024,KEY-BETA-2024,KEY-GAMMA-2024
3. Add:
   - Key: ADMIN_EMAIL
   - Value: your email
4. Redeploy (Netlify does this automatically after saving)

How the flow works:
  User opens site → License gate appears → enters key → validated server-side
  → if valid: key stored in browser → proceed to login
  → if invalid: error shown, user cannot proceed
  → Logout: license CLEARED from device → back to license gate next time

---

## Step 4 — Auto-trading (for users)

1. User enters Zerodha API Key + Access Token in the sidebar and clicks Connect
2. User selects the stock to trade from the Watchlist
3. User enables "Auto-execute trades" toggle in the Automation section
4. The system will automatically:
   - Place a BUY order when RSI crosses above the buy threshold on that stock
   - Place a SELL order when RSI drops below the sell threshold or trailing SL is hit
   - Log every order attempt in the Activity Log tab

Only the currently selected (active) stock gets auto-traded.
All other stocks are monitored but signals are logged only, not executed.

---

## Managing license keys

| Action | How |
|--------|-----|
| Give a user access | Add their key to VALID_LICENSE_KEYS, redeploy, send them the key |
| Revoke a key | Remove it from VALID_LICENSE_KEYS, redeploy |
| Force re-activation | Change all keys in VALID_LICENSE_KEYS |
| Remove dashboard access | Delete user from Netlify Identity → Users |

---

## File structure

  rsi-trader-deploy/
  ├── public/
  │   ├── index.html              - License gate + Login gate (public)
  │   └── dashboard.html          - Trading dashboard (protected)
  ├── netlify/
  │   └── functions/
  │       ├── validate-license.js - NEW: validates license keys against env var
  │       └── request-access.js   - Notifies admin when someone requests access
  └── netlify.toml                - Netlify config
