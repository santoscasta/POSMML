import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillSale } from '../lib/fulfillSale.js';

test('orders that do not require fulfillment complete without creating a fulfillment', async () => {
  let calls = 0;
  await fulfillSale(async (query) => {
    calls++;
    assert.match(query, /PosFulfillmentStatus/);
    return { order: { displayFulfillmentStatus: 'FULFILLMENT_NOT_REQUIRED' } };
  }, {}, 'gid://shopify/Order/1');
  assert.equal(calls, 1);
});
