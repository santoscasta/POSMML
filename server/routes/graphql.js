import { Router } from 'express';
import { getAccessToken, SHOPIFY_STORE, API_VERSION } from '../lib/shopify.js';
import { operationName } from '../../shared/diagnostics.js';
import { logEvent, logError, observeShopifyResult } from '../lib/diagnostics.js';

const router = Router();

router.post('/graphql', async (req, res) => {
  const started = performance.now();
  const operation = operationName(req.body?.query);
  logEvent('shopify.started', { operation });
  const token = await getAccessToken();
  if (!token) return res.status(401).json({ error: 'No access token' });

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    observeShopifyResult(data, { operation, status: response.status, durationMs: Math.round(performance.now() - started) });
    res.json(data);
  } catch (error) {
    logError('shopify.exception', error);
    res.status(500).json({ error: 'Error connecting to Shopify' });
  }
});

export default router;
