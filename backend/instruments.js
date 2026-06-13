// backend/instruments.js
const exchangeTokenMap = {
  NSE: new Map(),   // 'RELIANCE' → 738561
  NFO: new Map(),   // 'NIFTY25JUN24FUT' → ...
  MCX: new Map(),   // 'CRUDEOIL25JUNFUT' → ...
  BSE: new Map(),
};

async function loadInstruments() {
  const exchanges = ['NSE', 'NFO', 'MCX', 'BSE'];
  await Promise.all(exchanges.map(async (ex) => {
    const res = await fetch(`https://api.kite.trade/instruments/${ex}`, {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.KITE_API_KEY}:${process.env.KITE_ACCESS_TOKEN}` }
    });
    const csv = await res.text();
    const lines = csv.split('\n').slice(1);
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const [token, , tsym, , exch] = parts;
      exchangeTokenMap[ex]?.set(tsym, Number(token));
    }
    console.log(`[Instruments] ${ex}: ${exchangeTokenMap[ex].size} instruments loaded`);
  }));
}

function resolveToken(sym) {
  // sym = "NSE:RELIANCE" or "NFO:NIFTY25JUN24FUT"
  const [ex, ...rest] = sym.split(':');
  const trading = rest.join(':');
  return exchangeTokenMap[ex]?.get(trading) || null;
}

module.exports = { loadInstruments, resolveToken, exchangeTokenMap };