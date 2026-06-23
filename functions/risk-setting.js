// netlify/functions/risk-settings.js
// Load and save user risk management parameters

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const DEFAULT_RISK_SETTINGS = {
  total_capital: 100000,
  capital_allocation_pct: 80,
  max_drawdown_pct: 10,
  drawdown_alert_pct: 5,
  daily_loss_limit_pct: 3,
  daily_profit_target_pct: 5,
  max_open_positions: 3,
  max_single_trade_pct: 25,
  max_sector_exposure_pct: 40,
  max_intraday_turnover: 500000,
  max_same_sector_pos: 2,
  correlation_threshold: 0.75,
  locked_sector: '',
  hedge_ratio_pct: 10,
  margin_buffer_pct: 20,
  margin_call_alert_pct: 70,
  fno_margin_multiplier: 1.5,
  auto_square_off: true,
  todays_pnl: 0,
  trading_halted: false,
  halt_reason: '',
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // GET — load risk settings for a user
    if (event.httpMethod === 'GET') {
      const email = event.queryStringParameters?.email;
      if (!email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'email required' }),
        };
      }

      const { data, error } = await supabase
        .from('risk_settings')
        .select('*')
        .eq('email', email)
        .single();

      // If no record exists, return defaults
      if (error && error.code === 'PGRST116') {
        console.log(`No risk settings found for ${email}, returning defaults`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            settings: DEFAULT_RISK_SETTINGS,
          }),
        };
      }

      if (error) {
        console.error('Risk settings fetch error:', error.message);
        throw error;
      }

      // Merge with defaults to handle any missing fields
      const settings = { ...DEFAULT_RISK_SETTINGS, ...data };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          settings,
        }),
      };
    }

    // POST — save risk settings
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, email, settings } = body;

      if (!action || !email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'action and email required' }),
        };
      }

      if (action === 'save') {
        if (!settings || typeof settings !== 'object') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ ok: false, error: 'settings object required' }),
          };
        }

        const dataToSave = {
          email,
          ...settings,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('risk_settings')
          .upsert(dataToSave, { onConflict: 'email' });

        if (error) {
          console.error('Risk settings save error:', error.message);
          throw error;
        }

        console.log(`Risk settings saved for ${email}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            message: 'Risk settings saved',
          }),
        };
      }

      // Other actions
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid action' }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };

  } catch (error) {
    console.error('risk-settings error:', error.message);
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