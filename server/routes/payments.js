import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore } from '../lib/operationStore.js';
import { createPosService } from '../lib/posService.js';
import { getPayments } from '../lib/accounting.js';

import { sendReceipt } from '../lib/receipt.js';

const router = Router();
router.post('/send-receipt', async (req, res) => {
  try { res.json(await sendReceipt(shopifyGQL, getStore(), req.body)); }
  catch (error) { sendOperationError(res, error); }
});
export function sendOperationError(res, error) {
  res.status(error.status || 500).json({ error: error.message, code: error.code, safeToRestart: error.safeToRestart === true });
}

router.post('/checkout', async (req, res) => {
  try {
    const { operationId, ...input } = req.body;
    res.json(await createPosService(shopifyGQL, getStore()).checkout(operationId, input));
  } catch (error) { sendOperationError(res, error); }
});

// Old clients must reload; this endpoint must never debit a card a second time.
router.post('/payments', (req, res) => res.status(409).json({ error: 'Actualiza la aplicación para usar el cobro con reintentos seguros.' }));

router.get('/payments', async (req, res) => {
  try { res.json(await getPayments(shopifyGQL, getStore(), { sessionId: req.query.sessionId })); }
  catch (error) { sendOperationError(res, error); }
});

router.get('/payments/order/:orderId', async (req, res) => {
  try { res.json(await getPayments(shopifyGQL, getStore(), { orderId: req.params.orderId })); }
  catch (error) { sendOperationError(res, error); }
});

router.get('/operations/pending', (req, res) => {
  const pending = Object.values(getStore().read().operations).filter(op => !op.result);
  res.json(pending.map(op => ({ operationId: op.key, kind: op.kind, input: op.input, createdAt: op.createdAt,
    steps: Object.fromEntries(Object.entries(op.steps).map(([name, step]) => [name, step.status])) })));
});

export default router;
