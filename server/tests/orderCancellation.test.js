import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { parse } from 'graphql';

test('order cancellation checks refunds using valid GraphQL before cancelling', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-cancel-'));
  const previousDirectory = process.env.POS_DATA_DIR;
  const previousToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.POS_DATA_DIR = directory;
  process.env.SHOPIFY_ACCESS_TOKEN = 'qa-fake-token';
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (previousDirectory === undefined) delete process.env.POS_DATA_DIR;
    else process.env.POS_DATA_DIR = previousDirectory;
    if (previousToken === undefined) delete process.env.SHOPIFY_ACCESS_TOKEN;
    else process.env.SHOPIFY_ACCESS_TOKEN = previousToken;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const { default: router } = await import('../routes/refunds.js');
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/orders/cancel`;
  const orderId = 'gid://shopify/Order/11636';

  for (const scenario of [
    { name: 'fully refunded 200 EUR POS order with a completed preparation', refunded: '200.00', prepared: true, status: 200, cancels: true },
    { name: 'partially refunded order', refunded: '100.00', status: 409, error: /Reembolsa primero/ },
    { name: 'paid order without a refund', refunded: '0.00', status: 409, error: /Reembolsa primero/ },
    { name: 'missing order', missing: true, status: 404, error: /Pedido no encontrado/ },
    { name: 'Shopify rejects cancellation', refunded: '200.00', rejected: true, status: 400, cancels: true, error: /Cancellation rejected/ },
  ]) {
    await t.test(scenario.name, async () => {
      const calls = [];
      let preparationCancelled = false;
      globalThis.fetch = async (target, options) => {
        assert.match(String(target), /\/admin\/api\//);
        const { query, variables } = JSON.parse(options.body);
        const operation = parse(query).definitions[0].operation;
        calls.push({ operation, variables });
        if (query.includes('CancelPosOrderFulfillment')) preparationCancelled = true;
        if (query.includes('mutation CancelPosOrder(')) assert.ok(!scenario.prepared || preparationCancelled, 'Cannot cancel an order that has outstanding fulfillments');
        const data = query.includes('CancelPosOrderFulfillment') ? { fulfillmentCancel: { fulfillment: { id: 'fulfillment-1', status: 'CANCELLED' }, userErrors: [] } }
          : query.includes('OrderCancellationStatus') ? { order: { cancelledAt: '2026-11-09T16:00:00Z' } } : operation === 'query'
          ? { order: scenario.missing ? null : {
            cancelledAt: null, tags: ['POS MML'], fulfillments: scenario.prepared ? [{ id: 'fulfillment-1', status: 'SUCCESS', service: { handle: 'manual' }, trackingInfo: [] }] : [],
            totalReceivedSet: { shopMoney: { amount: '200.00' } },
            totalRefundedSet: { shopMoney: { amount: scenario.refunded } },
          } }
          : { orderCancel: { job: { id: 'job-1', done: false }, orderCancelUserErrors: scenario.rejected ? [{ message: 'Cancellation rejected' }] : [] } };
        return new Response(JSON.stringify({ data }), { status: 200 });
      };
      const response = await originalFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, refund: true, restock: true }),
      });
      const body = await response.json();
      assert.equal(response.status, scenario.status, JSON.stringify(body));
      if (scenario.error) assert.match(body.error, scenario.error);
      else assert.deepEqual(body, { success: true });
      assert.deepEqual(calls, [
        { operation: 'query', variables: { id: orderId } },
        ...(scenario.prepared ? [{ operation: 'mutation', variables: { id: 'fulfillment-1' } }] : []),
        ...(scenario.cancels ? [{ operation: 'mutation', variables: { orderId, reason: 'OTHER', restock: true } }] : []),
        ...(scenario.status === 200 ? [{ operation: 'query', variables: { id: orderId } }] : []),
      ]);
    });
  }
});
