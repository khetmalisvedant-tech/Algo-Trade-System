// netlify/functions/kite-auth.js
// Handles OAuth redirect from Zerodha Kite
// Exchanges request_token for access_token and stores it encrypted in Supabase

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const KITE_BASE = 'https://api.kite.trade';

// Encrypt function (same as save-credentials)
function encrypt(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryptionKey, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// Decrypt function (same as save-credentials)
function decrypt(ciphertext, encryptionKey) {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(encryptionKey, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

exports.handler = async (event) => {
  console.log('kite-auth triggered with query:', event.queryStringParameters);

  const requestToken = event.queryStringParameters?.request_token;
  const userEmail = event.queryStringParameters?.user;

  if (!requestToken || !userEmail) {
    return {
      statusCode: 400,
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Kite Auth Error</title></head>
        <body style="font-family:sans-serif;padding:20px">
        <h2>⚠️ OAuth Error</h2>
        <p>Missing request_token or user email. Please try again.</p>
        </body>
        </html>
      `,
      headers: { 'Content-Type': 'text/html' },
    };
  }

  try {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!encryptionKey || !apiKey || !apiSecret) {
      throw new Error('Server not configured: ENCRYPTION_KEY, KITE_API_KEY, KITE_API_SECRET required');
    }

    // Step 1: Retrieve the user's API secret from Supabase (encrypted)
    console.log(`Fetching credentials for ${userEmail}...`);
    const { data: credData, error: credError } = await supabase
      .from('user_credentials')
      .select('api_secret_encrypted')
      .eq('email', userEmail)
      .single();

    if (credError) {
      console.error('Could not fetch credentials:', credError.message);
      throw new Error('No credentials found for this user. Save API key first.');
    }

    // Step 2: Decrypt the user's API secret
    let userApiSecret;
    try {
      userApiSecret = decrypt(credData.api_secret_encrypted, encryptionKey);
    } catch (e) {
      console.error('Decryption failed:', e.message);
      throw new Error('Could not decrypt stored API secret');
    }

    // Step 3: Exchange request_token for access_token via Zerodha API
    console.log('Exchanging request_token for access_token...');
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + requestToken + userApiSecret)
      .digest('hex');

    const tokenResponse = await fetch(`${KITE_BASE}/session/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum: checksum,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json().catch(() => ({}));
      console.error('Zerodha token exchange failed:', errData);
      throw new Error(errData.message || 'Failed to exchange request token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.data?.access_token;

    if (!accessToken) {
      throw new Error('No access token in Zerodha response');
    }

    // Step 4: Encrypt and store the access token in Supabase
    console.log('Storing access token in Supabase...');
    const encryptedToken = encrypt(accessToken, encryptionKey);
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999); // Expires at end of today (Kite tokens are daily)

    const { error: updateError } = await supabase
      .from('user_credentials')
      .update({
        access_token_encrypted: encryptedToken,
        has_access_token: true,
        token_expires_at: expiresAt.toISOString(),
        token_last_updated: new Date().toISOString(),
      })
      .eq('email', userEmail);

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ OAuth successful for ${userEmail}`);

    // Step 5: Redirect back to dashboard with success indicator
    const dashboardUrl = `${event.headers.origin || 'http://localhost:8888'}?kite=connected`;
    return {
      statusCode: 302,
      headers: { Location: dashboardUrl },
      body: '',
    };

  } catch (error) {
    console.error('kite-auth error:', error.message);

    const errorUrl = `${event.headers.origin || 'http://localhost:8888'}?kite=error&reason=${encodeURIComponent(error.message)}`;
    return {
      statusCode: 302,
      headers: { Location: errorUrl },
      body: '',
    };
  }
};