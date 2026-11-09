import { getAccessToken, SHOPIFY_STORE, API_VERSION } from './shopify.js';
import { operationName } from '../../shared/diagnostics.js';
import { logEvent, logError, observeShopifyResult } from './diagnostics.js';

export default async function shopifyGQL(query, variables = {}) {
  const operation = operationName(query);
  const started = performance.now();
  logEvent('shopify.started', { operation });
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('No access token');
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await res.json();
    observeShopifyResult(data, { operation, status: res.status, durationMs: Math.round(performance.now() - started) });
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
    if (data.errors) throw new Error(data.errors.map(e => e.message).join(', '));
    return data.data;
  } catch (error) {
    logError('shopify.exception', error);
    throw error;
  }
}
