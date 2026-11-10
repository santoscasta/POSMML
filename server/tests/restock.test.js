import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOrderRestockable, getRestockAlerts, verifyRefundRestock } from '../lib/restock.js';

const orderId = 'gid://shopify/Order/1';
const expected = [{ lineItemId: 'line-1', quantity: 1, restockType: 'RETURN', locationId: 'location-1' }];
test('restock validation reads later order pages before rejecting an unlinked selected item', async () => {
  const cursors = [];
  const gql = async (_, { after }) => {
    cursors.push(after);
    return { order: { lineItems: after ? { nodes: [{ id: 'line-2', title: 'Prenda importada', variant: null }], pageInfo: { hasNextPage: false } } : { nodes: [{ id: 'line-1', title: 'Prenda', variant: { inventoryItem: { id: 'gid://shopify/InventoryItem/1', tracked: true } } }], pageInfo: { hasNextPage: true, endCursor: 'next' } } } };
  };
  await assert.rejects(assertOrderRestockable(gql, orderId, [{ lineItemId: 'line-2' }]), { code: 'RESTOCK_UNAVAILABLE' });
  assert.deepEqual(cursors, [null, 'next']);
});

test('restock validation ignores unselected unlinked items but rejects missing selected items and incomplete pages', async () => {
  const gql = async () => ({ order: { lineItems: { nodes: [{ id: 'line-1', title: 'Prenda', variant: { inventoryItem: { id: 'gid://shopify/InventoryItem/1', tracked: true } } }, { id: 'line-2', title: 'Importada', variant: null }], pageInfo: { hasNextPage: false } } } });
  await assertOrderRestockable(gql, orderId, [{ lineItemId: 'line-1' }]);
  await assert.rejects(assertOrderRestockable(gql, orderId, [{ lineItemId: 'deleted' }]), { code: 'RESTOCK_UNAVAILABLE' });
  for (const data of [{}, { order: { lineItems: { nodes: [], pageInfo: { hasNextPage: true } } } }]) await assert.rejects(assertOrderRestockable(async () => data, orderId, []), { code: 'RESTOCK_UNAVAILABLE' });
});

for (const [description, overrides] of [['wrong location', { location: { id: 'other' } }], ['short quantity', { quantity: 0 }], ['no restock', { restockType: 'NO_RESTOCK' }], ['unconfirmed', { restocked: false }]]) {
  test(`refund verification rejects ${description}`, async () => {
    const gql = async () => ({ refund: { refundLineItems: { nodes: [{ lineItem: { id: 'line-1' }, quantity: 1, restocked: true, restockType: 'RETURN', location: { id: 'location-1' }, ...overrides }], pageInfo: { hasNextPage: false } } } });
    await assert.rejects(verifyRefundRestock(gql, 'refund-1', expected), { code: 'RECONCILIATION_REQUIRED' });
  });
}

test('historical alerts report completed skipped restocks without flagging deliberate opt-outs, normal restocks or in-progress operations', () => {
  const affected = { key: 'issue', kind: 'exchange', result: { name: '#2' }, input: { restock: true, orderId }, quote: { accountingVersion: 2, orderName: '#1', returnedItems: [{ title: 'Importada', quantity: 1, inventoryItemId: null }] }, steps: {}, createdAt: '2026-11-09T17:39:01Z' };
  const normal = { ...structuredClone(affected), key: 'normal', quote: { ...affected.quote, returnedItems: [{ title: 'Normal', quantity: 1, inventoryItemId: 'inventory-1' }] }, steps: { 'exchange-restock': { status: 'done' } } };
  const state = { operations: { issue: affected, normal, optedOut: { ...affected, input: { restock: false } }, pending: { ...affected, result: undefined } } };
  const alerts = getRestockAlerts(state);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].orderName, '#1');
  assert.deepEqual(alerts[0].items, [{ title: 'Importada', quantity: 1 }]);
  assert.deepEqual(getRestockAlerts({}), []);
});
