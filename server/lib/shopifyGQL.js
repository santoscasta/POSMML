import { getAccessToken, SHOPIFY_STORE, API_VERSION } from './shopify.js';

export default async function shopifyGQL(query, variables = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    },
  );
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e => e.message).join(', '));
  return data.data;
}
