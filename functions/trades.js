// netlify/functions/trades.js
// Log executed trades to Supabase and retrieve trade history

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // GET — retrieve trade history for a user
    if (event.httpMethod === 'GET') {
      const email = event.queryStringParameters?.email;
      const limit = parseInt(event.queryStringParameters?.limit || '100');

      if (!email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'email required' }),
        };
      }

      // Fetch trades for this user, ordered by date descending
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Trade history fetch error:', error.message);
        throw error;
      }

      // Calculate summary statistics
      const summary = calculateSummary(trades);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          trades: trades || [],
          summary,
        }),
      };
    }

    // POST — log a new trade
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, email, symbol, side, qty, price, strategy, trigger_reason, entry_price, exit_price, realised_pnl } = body;

      if (action !== 'log' || !email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'action=log and email required' }),
        };
      }

      // Validate required fields for trade logging
      if (!symbol || !side || !qty || price === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: 'symbol, side, qty, price required' 
          }),
        };
      }

      const tradeData = {
        email,
        symbol,
        side: side.toUpperCase(),
        qty: parseInt(qty),
        price: parseFloat(price),
        strategy: strategy || null,
        trigger_reason: trigger_reason || null,
        entry_price: entry_price ? parseFloat(entry_price) : null,
        exit_price: exit_price ? parseFloat(exit_price) : null,
        realised_pnl: realised_pnl ? parseFloat(realised_pnl) : null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('trades')
        .insert([tradeData]);

      if (error) {
        console.error('Trade log error:', error.message);
        throw error;
      }

      console.log(`Trade logged for ${email}: ${side} ${qty} ${symbol} @ ₹${price}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'Trade logged',
          trade: data?.[0],
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };

  } catch (error) {
    console.error('trades error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message,
      }),
    };
  }
};

// Helper function to calculate trade summary statistics
function calculateSummary(trades) {
  if (!trades || trades.length === 0) {
    return {
      total_trades: 0,
      total_pnl: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
    };
  }

  const tradesWithPnL = trades.filter(t => t.realised_pnl !== null);
  const wins = tradesWithPnL.filter(t => parseFloat(t.realised_pnl) > 0).length;
  const losses = tradesWithPnL.filter(t => parseFloat(t.realised_pnl) < 0).length;
  const totalPnL = tradesWithPnL.reduce((sum, t) => sum + parseFloat(t.realised_pnl), 0);
  const winRate = tradesWithPnL.length > 0 
    ? parseFloat(((wins / tradesWithPnL.length) * 100).toFixed(2))
    : 0;

  return {
    total_trades: trades.length,
    total_pnl: parseFloat(totalPnL.toFixed(2)),
    wins,
    losses,
    win_rate: winRate,
  };
}