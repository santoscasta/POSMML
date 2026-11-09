import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'graphql';
import { createOperationStore } from '../lib/operationStore.js';
import { issueOrderGiftVoucher, orderGiftVouchers, assertGiftVouchersCancelled } from '../lib/orderGiftVoucher.js';
import { createPosService } from '../lib/posService.js';

const request = { orderId: 'gid://shopify/Order/11636', lineItemId: 'gid://shopify/LineItem/1', unit: 1 };
const fields = 'id lastCharacters note initialValue { amount } balance { amount currencyCode } enabled createdAt';

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'order-gift-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createOperationStore(directory);
  const order = {
    name: '#11636', cancelledAt: null, displayFinancialStatus: 'PAID',
    totalRefundedSet: { shopMoney: { amount: '0' } },
    customer: { id: 'gid://shopify/Customer/1', firstName: 'Ana', lastName: 'López', email: 'ana@example.com' },
    lineItems: { nodes: [{ id: request.lineItemId, title: 'TARJETA REGALO', quantity: 2, currentQuantity: 2, isGiftCard: false, originalUnitPriceSet: { shopMoney: { amount: '200.00', currencyCode: 'EUR' } } }], pageInfo: { hasNextPage: false } },
  };
  const cards = [], calls = [];
  const gql = async (query, variables) => {
    const name = parse(query).definitions[0].name.value;
    calls.push({ name, variables });
    if (overrides[name]) return overrides[name](variables);
    if (name === 'OrderGiftVoucher') return { order };
    if (name === 'IssuePosVoucher') {
      const input = variables.input;
      const card = { id: `gift-${cards.length + 1}`, lastCharacters: input.code.slice(-4), note: input.note, initialValue: { amount: input.initialValue }, balance: { amount: input.initialValue, currencyCode: 'EUR' }, enabled: true, createdAt: '2026-11-09T15:00:00Z' };
      cards.push(card);
      if (overrides.loseResponse) throw new Error('Response lost after creation');
      return { giftCardCreate: { giftCard: card, userErrors: [] } };
    }
    if (name === 'RecoverPosVoucher') return { giftCards: { nodes: cards, pageInfo: { hasNextPage: false } } };
    if (['OrderGiftVoucherStatus', 'RefundOrderGiftVoucher'].includes(name)) return { giftCard: cards.find(card => card.id === variables.id) };
    throw new Error(`Unexpected operation ${name}`);
  };
  return { directory, store, order, cards, calls, gql };
}

test('a purchased gift card uses the server price and customer, with no additional sale or refund', async t => {
  const f = fixture(t);
  const first = await issueOrderGiftVoucher(f.gql, f.store, { ...request, amount: 900, operationId: 'untrusted-key-0001' }, fields);
  const retry = await issueOrderGiftVoucher(f.gql, createOperationStore(f.directory), { ...request, operationId: 'different-key-0002' }, fields);
  assert.deepEqual(retry, first);
  assert.equal(f.cards.length, 1);
  const input = f.calls.find(call => call.name === 'IssuePosVoucher').variables.input;
  assert.equal(input.initialValue, '200.00');
  assert.equal(input.customerId, f.order.customer.id);
  assert.match(input.note, /#11636/);
  assert.equal(JSON.parse(input.note.split('---POS_META---\n')[1]).originOrderId, request.orderId);
  assert.equal(f.store.read().movements.length, 0);
});

test('two purchased units issue two distinct codes and reloading recovers the current balance', async t => {
  const f = fixture(t);
  const first = await issueOrderGiftVoucher(f.gql, f.store, request, fields);
  const second = await issueOrderGiftVoucher(f.gql, f.store, { ...request, unit: 2 }, fields);
  assert.notEqual(first.fullCode, second.fullCode);
  f.cards[0].balance.amount = '75.00';
  const loaded = await orderGiftVouchers(f.gql, createOperationStore(f.directory), request.orderId, fields);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].fullCode, first.fullCode);
  assert.equal(loaded[0].card.balance.amount, '75.00');
  assert.equal((await orderGiftVouchers(f.gql, f.store, 'another-order', fields)).length, 0);
});

test('a lost Shopify response recovers the original code without issuing another voucher', async t => {
  const f = fixture(t, { loseResponse: true });
  await assert.rejects(issueOrderGiftVoucher(f.gql, f.store, request, fields), { code: 'RECONCILIATION_REQUIRED' });
  const pending = Object.values(f.store.read().operations)[0];
  assert.equal(pending.kind, 'order_voucher');
  const result = await issueOrderGiftVoucher(f.gql, createOperationStore(f.directory), pending.input, fields);
  assert.equal(result.fullCode, pending.giftCardCode);
  assert.equal(result.card.id, f.cards[0].id);
  assert.equal(f.cards.length, 1);
});

for (const status of ['PENDING', 'PARTIALLY_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED']) {
  test(`cannot issue a gift voucher for a ${status} order`, async t => {
    const f = fixture(t);
    f.order.displayFinancialStatus = status;
    await assert.rejects(issueOrderGiftVoucher(f.gql, f.store, request, fields), { status: 409 });
    assert.equal(f.cards.length, 0);
  });
}

test('cancelled, refunded, wrong-product, native Shopify, foreign-currency and unavailable units cannot issue', async t => {
  const f = fixture(t);
  const line = f.order.lineItems.nodes[0];
  for (const [object, key, value] of [
    [f.order, 'cancelledAt', '2026-11-09T15:00:00Z'],
    [f.order.totalRefundedSet.shopMoney, 'amount', '200'],
    [line, 'title', 'Abrigo'], [line, 'isGiftCard', true],
    [line.originalUnitPriceSet.shopMoney, 'currencyCode', 'USD'],
    [line, 'currentQuantity', 0],
  ]) {
    const previous = object[key];
    object[key] = value;
    await assert.rejects(issueOrderGiftVoucher(f.gql, f.store, request, fields));
    object[key] = previous;
  }
  for (const invalid of [{ unit: 3 }, { unit: 0 }, { unit: 1.5 }, { lineItemId: 'gid://shopify/LineItem/99' }, { orderId: 'invalid' }]) {
    await assert.rejects(issueOrderGiftVoucher(f.gql, f.store, { ...request, ...invalid }, fields));
  }
  assert.equal(f.cards.length, 0);
});

test('gift card validation paginates to the requested order line', async t => {
  const f = fixture(t, { OrderGiftVoucher: ({ after }) => ({ order: after ? f.order : { ...f.order, lineItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } } }) });
  await issueOrderGiftVoucher(f.gql, f.store, request, fields);
  assert.deepEqual(f.calls.filter(call => call.name === 'OrderGiftVoucher').map(call => call.variables.after), [null, 'next']);
});

test('an active issued voucher blocks refunding that gift card until it is cancelled', async t => {
  const f = fixture(t);
  await issueOrderGiftVoucher(f.gql, f.store, request, fields);
  await assert.rejects(assertGiftVouchersCancelled(f.gql, f.store, request.orderId, [request.lineItemId]), { status: 409 });
  await assertGiftVouchersCancelled(f.gql, f.store, request.orderId, ['other-line']);
  // Exercise the actual refund service before any Shopify refund mutation.
  const service = createPosService(f.gql, f.store);
  const sessionId = 'session-1';
  const state = f.store.read();
  state.operations['refund-gift-test-0001'] = { key: 'refund-gift-test-0001', kind: 'refund', input: { orderId: request.orderId, amount: 200, method: 'CASH', refundLineItems: [{ lineItemId: request.lineItemId, quantity: 1 }] }, sessionId, steps: {} };
  f.store.write(state);
  await assert.rejects(service.refund('refund-gift-test-0001', state.operations['refund-gift-test-0001'].input), /Cancela primero el vale/);
  f.cards[0].enabled = false;
  await assertGiftVouchersCancelled(f.gql, f.store, request.orderId, [request.lineItemId]);
});
