// NSE Options Chain — server-side to bypass CORS
// GET /.netlify/functions/nse-chain?sym=NIFTY

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const sym = event.queryStringParameters?.sym || 'NIFTY';

  try {
    // Step 1: warm up the NSE session (required, else 401)
    await fetch('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    // Step 2: fetch option chain
    const apiUrl = sym === 'NIFTY' || sym === 'BANKNIFTY' || sym === 'FINNIFTY'
      ? `https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`
      : `https://www.nseindia.com/api/option-chain-equities?symbol=${sym}`;

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com/option-chain',
        'Accept': 'application/json',
      }
    });

    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: 'NSE fetch failed' }) };

    const data = await res.json();
    // Return just the strike table — the full chain is very large (~500KB)
    const records = data.records?.data || [];
    return { statusCode: 200, headers, body: JSON.stringify({ records: records.slice(0, 50) }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};