// netlify/functions/save-credentials.js
// Manages encrypted Kite API credentials storage in Supabase
// Uses AES-256-GCM encryption to securely store sensitive data

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Encryption utilities
function encrypt(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryptionKey, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

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
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length !== 64) {
    console.error('ENCRYPTION_KEY not properly configured');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Encryption not configured on server' 
      }),
    };
  }

  try {
    // GET — check if user has credentials
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
        .from('user_credentials')
        .select('api_key_encrypted, token_expires_at, has_access_token')
        .eq('email', email)
        .single();

      if (error && error.code === 'PGRST116') {
        // No record found
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            has_credentials: false,
            has_token: false,
            key_masked: '',
            token_expires_at: null,
          }),
        };
      }

      if (error) {
        throw error;
      }

      // Decrypt just to get the first few chars for masking
      let keyMasked = '';
      try {
        const decrypted = decrypt(data.api_key_encrypted, encryptionKey);
        keyMasked = decrypted.slice(0, 4) + '••••' + decrypted.slice(-3);
      } catch (e) {
        console.warn('Could not decrypt key for masking:', e.message);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          has_credentials: !!data.api_key_encrypted,
          has_token: data.has_access_token || false,
          key_masked: keyMasked,
          token_expires_at: data.token_expires_at,
        }),
      };
    }

    // POST — save, get, or delete credentials
    const body = JSON.parse(event.body || '{}');
    const { action, email, api_key, api_secret } = body;

    if (!action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'action required' }),
      };
    }

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'email required' }),
      };
    }

    // SAVE — encrypt & store credentials
    if (action === 'save') {
      if (!api_key || !api_secret) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ ok: false, error: 'api_key and api_secret required' }),
        };
      }

      const encrypted = encrypt(api_key, encryptionKey);
      const secretEncrypted = encrypt(api_secret, encryptionKey);

      const { error } = await supabase
        .from('user_credentials')
        .upsert(
          {
            email,
            api_key_encrypted: encrypted,
            api_secret_encrypted: secretEncrypted,
            created_at: new Date().toISOString(),
            has_access_token: false,
          },
          { onConflict: 'email' }
        );

      if (error) throw error;

      console.log(`Credentials saved for ${email}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'Credentials encrypted and saved to Supabase',
        }),
      };
    }

    // GET — retrieve API key for OAuth flow
    if (action === 'get') {
      const { data, error } = await supabase
        .from('user_credentials')
        .select('api_key_encrypted')
        .eq('email', email)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ ok: false, error: 'No credentials found — save API key first' }),
          };
        }
        throw error;
      }

      try {
        const apiKey = decrypt(data.api_key_encrypted, encryptionKey);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            api_key: apiKey,
          }),
        };
      } catch (e) {
        console.error('Decryption failed:', e.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ ok: false, error: 'Could not decrypt credentials' }),
        };
      }
    }

    // DELETE — remove credentials
    if (action === 'delete') {
      const { error } = await supabase
        .from('user_credentials')
        .delete()
        .eq('email', email);

      if (error) throw error;

      console.log(`Credentials deleted for ${email}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'Credentials cleared from Supabase',
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Invalid action' }),
    };

  } catch (error) {
    console.error('save-credentials error:', error.message);
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