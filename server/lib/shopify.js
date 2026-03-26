import dotenv from 'dotenv';
dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = '2025-04';

let cachedToken = null;
let tokenExpiresAt = 0;

export async function getAccessToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) return cachedToken;

  const response = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const data = await response.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 86400) * 1000;
    console.log('Access token obtained (expires in', data.expires_in, 'seconds)');
    return cachedToken;
  }
  console.error('Token request failed:', data);
  return null;
}

export { SHOPIFY_STORE, API_VERSION };
