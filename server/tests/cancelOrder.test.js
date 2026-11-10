import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'graphql';
import { cancelOrder } from '../lib/cancelOrder.js';

const orderId = 'gid://shopify/Order/11636';
const input = { orderId, refund: true, restock: true };
const prepared = id => ({ id, status: 'SUCCESS', service: { handle: 'manual' }, trackingInfo: [], inTransitAt: null, deliveredAt: null });
function fixture(options = {}) {
  const order = { tags: ['POS MML'], cancelledAt: null,
    totalReceivedSet: { shopMoney: { amount: '200.00' } }, totalRefundedSet: { shopMoney: { amount: '200.00' } },
    fulfillments: [prepared('fulfillment-1')], ...options.order };
  const calls = [], waits = [];
  let lost = false, polls = 0;
  const gql = async (query, variables) => {
    const operation = parse(query).definitions[0];
    const name = operation.name.value;
    calls.push({ name, variables });
    if (name === 'OrderCancellationState') return { order: options.missing ? null : structuredClone(order) };
    if (name === 'RestockOrderLines') return { order: { lineItems: { nodes: options.lines || [], pageInfo: { hasNextPage: false, endCursor: null } } } };
    if (name === 'CancelPosOrderFulfillment') {
      const fulfillment = order.fulfillments.find(item => item.id === variables.id);
      if (options.fulfillmentRejected) return { fulfillmentCancel: { fulfillment: null, userErrors: [{ message: 'Rejected' }] } };
      if (!options.fulfillmentUnconfirmed) fulfillment.status = 'CANCELLED';
      if (options.loseFulfillmentResponse && !lost) { lost = true; throw new Error('Response lost after cancellation'); }
      return { fulfillmentCancel: { fulfillment: structuredClone(fulfillment), userErrors: [] } };
    }
    if (name === 'CancelPosOrder') {
      const args = operation.selectionSet.selections[0].arguments;
      assert.equal(args.find(arg => arg.name.value === 'refund').value.value, false);
      assert.equal(args.find(arg => arg.name.value === 'notifyCustomer').value.value, false);
      assert.ok(order.fulfillments.every(item => ['CANCELLED', 'ERROR', 'FAILURE'].includes(item.status)), 'Cannot cancel an order that has outstanding fulfillments');
      return { orderCancel: { job: options.noJob ? null : { id: 'job-1', done: false }, orderCancelUserErrors: options.orderRejected ? [{ message: 'Cancellation rejected' }] : [] } };
    }
    if (name === 'OrderCancellationStatus') {
      polls++;
      if (!options.unconfirmed && polls >= (options.confirmAfter || 1)) order.cancelledAt = '2026-11-09T16:00:00Z';
      return { order: { cancelledAt: order.cancelledAt } };
    }
    throw new Error(`Unexpected Shopify operation ${name}`);
  };
  const run = request => cancelOrder(gql, request || input, { attempts: 3, wait: async milliseconds => { waits.push(milliseconds); } });
  return { order, calls, waits, gql, run };
}
const names = f => f.calls.map(call => call.name);

test('a refunded POS order cancels its completed preparation before cancelling the order', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { success: true });
  assert.deepEqual(names(f), ['OrderCancellationState', 'RestockOrderLines', 'CancelPosOrderFulfillment', 'CancelPosOrder', 'OrderCancellationStatus']);
  assert.deepEqual(f.calls.find(call => call.name === 'CancelPosOrder').variables, { orderId, reason: 'OTHER', restock: true });
});

test('all active POS preparations are cancelled; failed and already cancelled ones are skipped', async () => {
  const f = fixture({ order: { fulfillments: [prepared('one'), prepared('two'), { id: 'old', status: 'CANCELLED' }, { id: 'failed', status: 'FAILURE' }, { id: 'error', status: 'ERROR' }] } });
  await f.run({ ...input, restock: false, reason: 'CUSTOMER' });
  assert.deepEqual(f.calls.filter(call => call.name === 'CancelPosOrderFulfillment').map(call => call.variables.id), ['one', 'two']);
  assert.deepEqual(f.calls.find(call => call.name === 'CancelPosOrder').variables, { orderId, reason: 'CUSTOMER', restock: false });
});

test('unfulfilled orders and already cancelled orders do not change any preparations', async () => {
  const f = fixture({ order: { fulfillments: [] } });
  await f.run();
  assert.deepEqual(names(f), ['OrderCancellationState', 'RestockOrderLines', 'CancelPosOrder', 'OrderCancellationStatus']);
  const cancelled = fixture({ order: { cancelledAt: '2026-11-09T16:00:00Z' } });
  await cancelled.run();
  assert.deepEqual(names(cancelled), ['OrderCancellationState']);
});

test('paid and partially refunded orders are blocked before changing preparations, including refund:false', async () => {
  for (const amount of ['0.00', '100.00']) {
    const f = fixture({ order: { totalRefundedSet: { shopMoney: { amount } } } });
    await assert.rejects(f.run({ ...input, refund: false }), /Reembolsa primero/);
    assert.deepEqual(names(f), ['OrderCancellationState']);
  }
});

test('unreadable financial totals never allow preparation cancellation', async () => {
  const f = fixture({ order: { totalReceivedSet: null } });
  await assert.rejects(f.run(), /Importe inválido/);
  assert.deepEqual(names(f), ['OrderCancellationState']);
});

test('tracking, external services, transit, delivered and non-POS preparations are left unchanged', async () => {
  for (const overrides of [{ trackingInfo: [{ number: 'TRACK-1' }] }, { service: { handle: 'external' } }, { service: null }, { inTransitAt: '2026-11-09' }, { deliveredAt: '2026-11-09' }, { trackingInfo: undefined }]) {
    const f = fixture({ order: { fulfillments: [prepared('safe-first'), { ...prepared('external-second'), ...overrides }] } });
    await assert.rejects(f.run(), { status: 409 });
    assert.deepEqual(names(f), ['OrderCancellationState']);
  }
  const f = fixture({ order: { tags: [] } });
  await assert.rejects(f.run(), { status: 409 });
  assert.deepEqual(names(f), ['OrderCancellationState']);
});

test('a missing or truncated preparation list never results in a partial cancellation', async () => {
  for (const fulfillments of [undefined, Array.from({ length: 250 }, (_, index) => prepared(String(index)))]) {
    const f = fixture({ order: { fulfillments } });
    await assert.rejects(f.run(), /comprobar todas las preparaciones/);
    assert.deepEqual(names(f), ['OrderCancellationState']);
  }
});

test('a rejected or unconfirmed preparation cancellation stops before orderCancel', async () => {
  for (const options of [{ fulfillmentRejected: true }, { fulfillmentUnconfirmed: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run(), { status: 409 });
    assert.deepEqual(names(f), ['OrderCancellationState', 'RestockOrderLines', 'CancelPosOrderFulfillment']);
  }
});

test('retry after a lost response resumes from Shopify state without cancelling a preparation twice', async () => {
  const f = fixture({ loseFulfillmentResponse: true, order: { fulfillments: [prepared('one'), prepared('two')] } });
  await assert.rejects(f.run(), /Response lost/);
  assert.deepEqual(await f.run(), { success: true });
  assert.deepEqual(f.calls.filter(call => call.name === 'CancelPosOrderFulfillment').map(call => call.variables.id), ['one', 'two']);
  assert.equal(names(f).filter(name => name === 'CancelPosOrder').length, 1);
});

test('asynchronous order cancellation is only successful once cancelledAt is confirmed', async () => {
  const f = fixture({ confirmAfter: 3 });
  await f.run();
  assert.deepEqual(f.waits, [500, 500]);
  const pending = fixture({ unconfirmed: true });
  await assert.rejects(pending.run(), /sigue procesando/);
  pending.order.cancelledAt = '2026-11-09T16:00:00Z';
  await pending.run();
  assert.equal(names(pending).filter(name => name === 'CancelPosOrder').length, 1);
});

test('invalid IDs, missing orders, Shopify rejection and absent cancellation jobs are reported', async () => {
  await assert.rejects(fixture().run({ ...input, orderId: 'invalid' }), /Pedido inválido/);
  await assert.rejects(fixture({ missing: true }).run(), { status: 404 });
  await assert.rejects(fixture({ orderRejected: true }).run(), /Cancellation rejected/);
  await assert.rejects(fixture({ noJob: true }).run(), /no ha confirmado/);
});

test('cancellation blocks missing inventory links before cancelling any preparation', async () => {
  const f = fixture({ lines: [{ id: 'line-1', title: 'Prenda importada', currentQuantity: 1, variant: null }] });
  await assert.rejects(f.run(), { code: 'RESTOCK_UNAVAILABLE' });
  assert.deepEqual(names(f), ['OrderCancellationState', 'RestockOrderLines']);
});

test('already refunded lines without inventory do not prevent cancellation', async () => {
  const f = fixture({ lines: [{ id: 'line-1', title: 'Prenda devuelta', currentQuantity: 0, variant: null }] });
  assert.deepEqual(await f.run(), { success: true });
});
