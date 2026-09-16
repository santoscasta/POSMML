import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createOperationStore } from '../lib/operationStore.js';
import { createPosService } from '../lib/posService.js';
import { computeKPIs, getPayments, paymentSplits } from '../lib/accounting.js';
import { requireAuth, checkOrigin } from '../lib/auth.js';

const key = '11111111-1111-4111-8111-111111111111';
const orderId = 'gid://shopify/Order/1';
const refundInput = { orderId, amount: 20, method: 'VOUCHER', refundLineItems: [{ lineItemId: 'gid://shopify/LineItem/1', quantity: 1 }], restock: false };
const checkoutInput = { cart: { items: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 1, price: 100 }] }, payment: { method: 'CARD', amount: 100 } };
const recoveryTag = `pos-op-${key.replaceAll('-', '').slice(0, 24)}`;
function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createOperationStore(directory);
  const calls = [];
  const handlers = {
    PosSessions: () => ({ metaobjects: { nodes: [{ id: 'session-A', updatedAt: '2026-09-07T08:00:00Z', fields: [{ key: 'status', value: 'OPEN' }] }], pageInfo: { hasNextPage: false } } }),
    PosDraft: () => ({ draftOrderCreate: { draftOrder: { id: 'draft-1', totalPriceSet: { shopMoney: { amount: '100', currencyCode: 'EUR' } } }, userErrors: [] } }),
    PosComplete: () => ({ draftOrderComplete: { draftOrder: { order: { id: orderId, name: '#1' } }, userErrors: [] } }),
    PosPaidRecovery: () => ({ order: { id: orderId, displayFinancialStatus: 'PENDING' } }),
    PosFulfillmentStatus: () => ({ order: { id: orderId, displayFulfillmentStatus: 'FULFILLED' } }),
    PosPaid: () => ({ orderMarkAsPaid: { order: { id: orderId }, userErrors: [] } }),
    PosVoucher: () => ({ giftCards: { nodes: [{ id: 'card-1', lastCharacters: '1234', enabled: true, balance: { amount: '100' } }], pageInfo: { hasNextPage: false } } }),
    PosDebit: () => ({ giftCardDebit: { giftCardDebitTransaction: { id: 'debit-1' }, userErrors: [] } }),
    PosRefundOrder: () => ({ order: { id: orderId, name: '#1', totalPriceSet: { shopMoney: { amount: '100', currencyCode: 'EUR' } }, totalRefundedSet: { shopMoney: { amount: '0' } }, transactions: [{ id: 'parent-1', kind: 'SALE', status: 'SUCCESS', gateway: 'manual' }] } }),
    PosRefund: () => ({ refundCreate: { refund: { id: 'refund-1', transactions: { nodes: [{ status: 'SUCCESS' }] } }, userErrors: [] } }),
    PosRefundVoucher: () => ({ giftCardCreate: { giftCard: { id: 'card-new' }, giftCardCode: 'ignored', userErrors: [] } }),
    ...overrides,
  };
  const gql = async (query, variables) => {
    const name = query.match(/(?:query|mutation)\s+(\w+)/)?.[1];
    calls.push({ name, query, variables });
    assert.ok(handlers[name], `Unexpected GraphQL operation ${name}`);
    return handlers[name](variables, query);
  };
  return { store, calls, gql, directory, service: createPosService(gql, store) };
}
const count = (f, name) => f.calls.filter(c => c.name === name).length;

test('checkout retries return same order across process/store recreation', async t => {
  const f = fixture(t);
  const first = await f.service.checkout(key, checkoutInput);
  const restarted = createPosService(f.gql, createOperationStore(f.directory));
  assert.deepEqual(await restarted.checkout(key, checkoutInput), first);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosComplete'), 1);
  assert.equal(f.store.read().movements.length, 1);
  assert.match(f.calls.find(c => c.name === 'PosComplete').query, /paymentPending: true/);
  const draftInput = f.calls.find(c => c.name === 'PosDraft').variables.input;
  assert.deepEqual(draftInput.lineItems[0].priceOverride, { amount: '100.00', currencyCode: 'EUR' });
  assert.ok(draftInput.tags.every(tag => tag.length <= 40));
});

test('checkout accepts a zero manual item price', async t => {
  const f = fixture(t, {
    PosDraft: () => ({ draftOrderCreate: { draftOrder: { id: 'draft-1', totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } } }, userErrors: [] } }),
  });
  const input = { cart: { items: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 1, price: 0 }] }, payment: { method: 'CARD', amount: 0 } };
  await f.service.checkout(key, input);
  assert.equal(f.calls.find(c => c.name === 'PosDraft').variables.input.lineItems[0].priceOverride.amount, '0.00');
});

test('failed payment resumes after order creation without duplicating voucher debits', async t => {
  let tries = 0;
  const f = fixture(t, { PosPaid: () => ++tries === 1
    ? { orderMarkAsPaid: { order: null, userErrors: [{ message: 'Try again' }] } }
    : { orderMarkAsPaid: { order: { id: orderId }, userErrors: [] } } });
  const input = { ...checkoutInput, payment: { method: 'VOUCHER', amount: 100, voucherCode: '****1234' } };
  await assert.rejects(f.service.checkout(key, input), /Try again/);
  const service = createPosService(f.gql, createOperationStore(f.directory));
  await service.checkout(key, input);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosComplete'), 1);
  assert.equal(count(f, 'PosDebit'), 1);
  assert.equal(count(f, 'PosPaid'), 2);
});

test('lost draft response is reconciled by operation tag without another creation', async t => {
  const f = fixture(t, {
    PosDraft: () => { throw new Error('connection lost'); },
    PosDraftRecovery: () => ({ draftOrders: { nodes: [{ id: 'draft-1', tags: [recoveryTag], totalPriceSet: { shopMoney: { amount: '100', currencyCode: 'EUR' } } }] } }),
  });
  await assert.rejects(f.service.checkout(key, checkoutInput), { code: 'RECONCILIATION_REQUIRED' });
  await createPosService(f.gql, createOperationStore(f.directory)).checkout(key, checkoutInput);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosDraftRecovery'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

test('unconfirmed mutation is blocked when read-only reconciliation finds nothing', async t => {
  const f = fixture(t, {
    PosDraft: () => { throw new Error('timeout'); },
    PosDraftRecovery: () => ({ draftOrders: { nodes: [] } }),
  });
  await assert.rejects(f.service.checkout(key, checkoutInput), { code: 'RECONCILIATION_REQUIRED' });
  await assert.rejects(f.service.checkout(key, checkoutInput), { code: 'RECONCILIATION_REQUIRED' });
  assert.equal(count(f, 'PosDraft'), 1);
});

test('operation keys cannot be reused with a different amount', async t => {
  const f = fixture(t);
  await f.service.checkout(key, checkoutInput);
  await assert.rejects(f.service.checkout(key, { ...checkoutInput, payment: { method: 'CARD', amount: 90 } }), { code: 'CONFLICT' });
  assert.equal(count(f, 'PosDraft'), 1);
});

test('concurrent requests, including another store instance, cannot duplicate a checkout', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { PosDraft: async () => { await gate; return { draftOrderCreate: { draftOrder: { id: 'draft-1', totalPriceSet: { shopMoney: { amount: '100', currencyCode: 'EUR' } } } } }; } });
  const running = f.service.checkout(key, checkoutInput);
  await assert.rejects(createPosService(f.gql, createOperationStore(f.directory)).checkout(key, checkoutInput), { code: 'BUSY' });
  release();
  await running;
  assert.equal(count(f, 'PosDraft'), 1);
});

test('refund rejection never issues a gift card', async t => {
  const f = fixture(t, { PosRefund: () => ({ refundCreate: { refund: null, userErrors: [{ message: 'Invalid refund' }] } }) });
  await assert.rejects(f.service.refund(key, refundInput), /Invalid refund/);
  assert.equal(count(f, 'PosRefundVoucher'), 0);
  assert.equal(f.store.read().movements.length, 0);
});

test('gift card rejection leaves a resumable refund; retry issues one card, not a second refund', async t => {
  let tries = 0;
  const f = fixture(t, { PosRefundVoucher: () => ++tries === 1
    ? { giftCardCreate: { giftCard: null, userErrors: [{ message: 'Issuance failed' }] } }
    : { giftCardCreate: { giftCard: { id: 'card-new' }, userErrors: [] } } });
  await assert.rejects(f.service.refund(key, refundInput), /Issuance failed/);
  assert.equal(f.store.read().operations[key].result, undefined);
  assert.equal(f.store.read().movements[0].amount, 20);
  const result = await createPosService(f.gql, createOperationStore(f.directory)).refund(key, refundInput);
  assert.match(result.voucherCode, /^[A-F0-9]{16}$/);
  assert.equal(count(f, 'PosRefund'), 1);
  assert.equal(f.store.read().movements.length, 1);
  assert.deepEqual(await f.service.refund(key, refundInput), result);
  assert.equal(count(f, 'PosRefundVoucher'), 2);
});

test('lost gift card response recovers the persisted code without issuing another card', async t => {
  let savedCode;
  const f = fixture(t, {
    PosRefundVoucher: variables => { savedCode = variables.input.code; throw new Error('timeout'); },
    PosRefundVoucherRecovery: () => ({ giftCards: { nodes: [{ id: 'card-new', note: `POS ${key}`, lastCharacters: savedCode.slice(-4), initialValue: { amount: '20' } }] } }),
  });
  await assert.rejects(f.service.refund(key, refundInput), { code: 'RECONCILIATION_REQUIRED' });
  const result = await createPosService(f.gql, createOperationStore(f.directory)).refund(key, refundInput);
  assert.equal(result.voucherCode, savedCode);
  assert.equal(count(f, 'PosRefundVoucher'), 1);
  assert.equal(count(f, 'PosRefund'), 1);
});

test('incomplete refund cannot be bypassed using another operation key', async t => {
  const f = fixture(t, { PosRefundVoucher: () => ({ giftCardCreate: { giftCard: null, userErrors: [{ message: 'Failed' }] } }) });
  await assert.rejects(f.service.refund(key, refundInput));
  await assert.rejects(f.service.refund('22222222-2222-4222-8222-222222222222', refundInput), { code: 'PENDING' });
  assert.equal(count(f, 'PosRefund'), 1);
});

test('partial refunds preserve original sale and use independent session/amount', async t => {
  const f = fixture(t);
  await f.service.checkout(key, checkoutInput);
  await f.service.refund('22222222-2222-4222-8222-222222222222', { ...refundInput, method: 'CASH' });
  const payments = f.store.read().movements;
  assert.equal(payments.length, 2);
  assert.equal(payments[0].type, 'sale');
  assert.equal(payments[0].amount, 100);
  assert.equal(payments[1].amount, 20);
  assert.deepEqual(computeKPIs(payments, 50), {
    totalOrders: 1, grossSales: 100, refunds: 20, cashSales: 0, cardSales: 100,
    bizumSales: 0, voucherSales: 0, refundsCash: 20, expectedCash: 30,
  });
  assert.equal(f.calls.some(c => /orderUpdate/.test(c.query)), false);
});

test('mixed cash accounting uses stored splits and exact cents', async t => {
  const f = fixture(t);
  const payment = { method: 'MIXED', amount: 100, mixedPayments: [{ method: 'CASH', amount: 20 }, { method: 'CARD', amount: 80 }] };
  await f.service.checkout(key, { ...checkoutInput, payment });
  const movements = f.store.read().movements;
  assert.deepEqual(movements[0].mixedPayments, payment.mixedPayments);
  assert.equal(computeKPIs(movements, 0).expectedCash, 20);
  assert.equal(computeKPIs(movements, 0).cardSales, 80);
  assert.throws(() => paymentSplits({ ...payment, amount: 90 }), /no coincide/);
  assert.throws(() => paymentSplits({ method: 'VOUCHER', amount: 1 }), /código/);
  assert.throws(() => paymentSplits({ method: 'CARD', amount: -1 }), /inválido/);
});

test('historical payments paginate and never filter on session opening or order creation date', async t => {
  const f = fixture(t);
  const state = f.store.read();
  state.movements.push({ id: 'refund', shopifyOrderId: orderId, shopifyOrderName: '#1', type: 'refund', method: 'CASH', amount: 20, sessionId: 'new-session', createdAt: '2026-09-07T09:00:00Z' });
  f.store.write(state);
  let page = 0;
  const gql = async (query, variables) => {
    assert.doesNotMatch(query, /created_at/);
    if (page++ === 0) return { orders: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } };
    assert.equal(variables.after, 'next');
    return { orders: { nodes: [{ id: orderId, name: '#1', createdAt: '2026-01-01T09:00:00Z', totalPriceSet: { shopMoney: { amount: '100' } }, metafields: { nodes: [{ key: 'payment_method', value: 'CASH' }, { key: 'session_id', value: 'old-session' }] } }], pageInfo: { hasNextPage: false } } };
  };
  const payments = await getPayments(gql, f.store);
  assert.equal(payments.length, 2);
  assert.equal(payments.find(p => p.type === 'sale').sessionId, 'old-session');
  assert.equal(computeKPIs(payments.filter(p => p.sessionId === 'new-session'), 50).expectedCash, 30);
});

test('old mixed payments without splits block an inaccurate closing', () => {
  assert.throws(() => computeKPIs([{ amount: 100, type: 'sale', method: 'MIXED', shopifyOrderName: '#old' }]), /Falta el desglose/);
});

test('every protected endpoint requires valid credentials and an allowed origin', async t => {
  const previous = { username: process.env.POS_USERNAME, password: process.env.POS_PASSWORD, origins: process.env.ALLOWED_ORIGINS };
  process.env.POS_USERNAME = 'cashier'; process.env.POS_PASSWORD = 'test-password'; process.env.ALLOWED_ORIGINS = 'https://pos.example';
  t.after(() => {
    for (const [key, value] of Object.entries({ POS_USERNAME: previous.username, POS_PASSWORD: previous.password, ALLOWED_ORIGINS: previous.origins })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const app = express();
  app.use(checkOrigin);
  app.use('/api', requireAuth);
  app.all('/api/{*path}', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = `Basic ${Buffer.from('cashier:test-password').toString('base64')}`;
  for (const route of ['graphql', 'checkout', 'refunds', 'vouchers', 'sessions/open', 'operations/pending']) {
    assert.equal((await fetch(`${base}/api/${route}`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/api/${route}`, { method: 'POST', headers: { authorization } })).status, 200);
    assert.equal((await fetch(`${base}/api/${route}`, { method: 'POST', headers: { authorization, origin: 'https://evil.example' } })).status, 403);
  }
  assert.equal((await fetch(`${base}/api/graphql`, { headers: { authorization, origin: 'https://pos.example' } })).status, 200);
  delete process.env.POS_PASSWORD;
  assert.equal((await fetch(`${base}/api/graphql`, { headers: { authorization } })).status, 503);
});

test('closing a session does not replace its persisted opening date', async () => {
  const { parseSession } = await import('../routes/sessions.js');
  const openedAt = '2026-09-07T08:00:00Z';
  const node = { id: 'session-A', updatedAt: '2026-09-07T18:00:00Z', fields: [{ key: 'status', value: 'CLOSED' }] };
  assert.equal(parseSession(node, { 'session-A': openedAt }).openedAt, openedAt);
  assert.equal(parseSession(node).openedAt, null);
  assert.equal(parseSession({ ...node, fields: [...node.fields, { key: 'opened_at', value: openedAt }] }).openedAt, openedAt);
});

test('a failed or pending refund transaction never issues a spendable voucher', async t => {
  const f = fixture(t, {
    PosRefund: () => ({ refundCreate: { refund: { id: 'refund-1', transactions: { nodes: [{ status: 'PENDING' }] } } } }),
    PosRefundStatus: () => ({ refund: { id: 'refund-1', transactions: { nodes: [{ status: 'PENDING' }] } } }),
  });
  await assert.rejects(f.service.refund(key, refundInput), { code: 'RECONCILIATION_REQUIRED' });
  assert.equal(count(f, 'PosRefundVoucher'), 0);
  assert.equal(f.store.read().movements.length, 0);
});

test('insufficient voucher balance fails before creating any order', async t => {
  const f = fixture(t, { PosVoucher: () => ({ giftCards: { nodes: [{ id: 'card-1', lastCharacters: '1234', enabled: true, balance: { amount: '5' } }], pageInfo: { hasNextPage: false } } }) });
  await assert.rejects(f.service.checkout(key, { ...checkoutInput, payment: { method: 'VOUCHER', amount: 100, voucherCode: '1234' } }), error => error.safeToRestart === true && /Saldo insuficiente/.test(error.message));
  assert.equal(count(f, 'PosDraft'), 0);
  assert.equal(count(f, 'PosDebit'), 0);
});

test('closing cannot race a checkout because both use the durable lock', async t => {
  const f = fixture(t);
  await f.store.exclusive(async () => {
    await assert.rejects(f.service.checkout(key, checkoutInput), { code: 'BUSY' });
  });
  assert.equal(count(f, 'PosDraft'), 0);
});

test('card and voucher refunds do not subtract cash from a mixed sale', () => {
  const movements = [
    { type: 'sale', method: 'MIXED', amount: 100, mixedPayments: [{ method: 'CASH', amount: 20 }, { method: 'CARD', amount: 80 }] },
    { type: 'refund', method: 'VOUCHER', amount: 10 },
    { type: 'refund', method: 'CARD', amount: 10 },
  ];
  const kpis = computeKPIs(movements, 50);
  assert.equal(kpis.refunds, 20);
  assert.equal(kpis.refundsCash, 0);
  assert.equal(kpis.expectedCash, 70);
});

test('already-paid zero order completes without trying to mark paid again', async t => {
  const f = fixture(t, {
    PosDraft: () => ({ draftOrderCreate: { draftOrder: { id: 'draft-1', totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } } } } }),
    PosPaidRecovery: () => ({ order: { id: orderId, displayFinancialStatus: 'PAID' } }),
  });
  const input = { cart: { items: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 1, price: 0 }] }, payment: { method: 'CASH', amount: 0, cashReceived: 0 } };
  await f.service.checkout(key, input);
  await f.service.checkout(key, input);
  assert.equal(count(f, 'PosPaid'), 0);
  assert.equal(count(f, 'PosComplete'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

test('temporarily locked payment resumes once Shopify confirms paid, without a second mutation', async t => {
  let paid = false;
  const f = fixture(t, {
    PosPaidRecovery: () => ({ order: { id: orderId, displayFinancialStatus: paid ? 'PAID' : 'PENDING' } }),
    PosPaid: () => { paid = true; return ({ orderMarkAsPaid: { order: null, userErrors: [{ message: 'Order is temporarily unavailable to be modified.' }] } }); },
  });
  await f.service.checkout(key, checkoutInput);
  await createPosService(f.gql, createOperationStore(f.directory)).checkout(key, checkoutInput);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosPaid'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

test('failed pre-payment status read remains safely retryable', async t => {
  let tries = 0;
  const f = fixture(t, {
    PosPaidRecovery: () => { if (++tries === 1) throw new Error('read timeout'); return { order: { id: orderId, displayFinancialStatus: 'PENDING' } }; },
  });
  await assert.rejects(f.service.checkout(key, checkoutInput), /read timeout/);
  await f.service.checkout(key, checkoutInput);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosPaid'), 1);
});

test('closing theoretical cash includes initial float, mixed cash and cash refunds only', () => {
  const movements = [
    { type: 'sale', method: 'CASH', amount: 25.50 },
    { type: 'sale', method: 'MIXED', amount: 40, mixedPayments: [{ method: 'CASH', amount: 10 }, { method: 'CARD', amount: 30 }] },
    { type: 'refund', method: 'CASH', amount: 5.25 },
    { type: 'refund', method: 'CARD', amount: 12 },
  ];
  assert.equal(computeKPIs([], 100).expectedCash, 100);
  assert.equal(computeKPIs(movements, 100).expectedCash, 130.25);
  assert.equal(computeKPIs(movements, 0).expectedCash, 30.25);
});

test('temporary Shopify order lock retries the same payment without duplicating sale or voucher', async t => {
  let tries = 0;
  const f = fixture(t, { PosPaid: () => ++tries === 1
    ? { orderMarkAsPaid: { order: null, userErrors: [{ message: 'Order is temporarily unavailable to be modified.' }] } }
    : { orderMarkAsPaid: { order: { id: orderId }, userErrors: [] } } });
  await f.service.checkout(key, { ...checkoutInput, payment: { method: 'VOUCHER', amount: 100, voucherCode: '1234' } });
  assert.equal(count(f, 'PosPaid'), 2);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosComplete'), 1);
  assert.equal(count(f, 'PosDebit'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

test('persistent temporary lock stops after bounded retries and can resume', async t => {
  let locked = true;
  const f = fixture(t, { PosPaid: () => locked
    ? { orderMarkAsPaid: { order: null, userErrors: [{ message: 'Order is temporarily unavailable to be modified.' }] } }
    : { orderMarkAsPaid: { order: { id: orderId }, userErrors: [] } } });
  await assert.rejects(f.service.checkout(key, checkoutInput), /Reanudar cobro pendiente/);
  assert.equal(count(f, 'PosPaid'), 4);
  assert.equal(f.store.read().movements.length, 0);
  locked = false;
  await f.service.checkout(key, checkoutInput);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

function fulfillmentFixture(t, { loseResponse = false, reject = false, hold = false } = {}) {
  const closed = new Set();
  let fail = reject;
  const f = fixture(t, {
    PosFulfillmentStatus: () => ({ order: { id: orderId, displayFulfillmentStatus: closed.size === 2 ? 'FULFILLED' : 'UNFULFILLED' } }),
    PosFulfillmentOrders: ({ after }) => ({ order: { fulfillmentOrders: {
      nodes: [{ id: after ? 'fo-2' : 'fo-1', status: hold ? 'ON_HOLD' : 'OPEN', supportedActions: hold ? [] : [{ action: 'CREATE_FULFILLMENT' }] }],
      pageInfo: { hasNextPage: !after, endCursor: after ? null : 'page-2' },
    } } }),
    PosFulfillmentRecovery: ({ id }) => ({ fulfillmentOrder: { id, status: closed.has(id) ? 'CLOSED' : 'OPEN' } }),
    PosFulfill: ({ fulfillment }) => {
      const id = fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderId;
      if (fail) { fail = false; return { fulfillmentCreate: { fulfillment: null, userErrors: [{ message: 'Temporarily locked' }] } }; }
      closed.add(id);
      if (loseResponse && id === 'fo-1') throw new Error('Lost response');
      return { fulfillmentCreate: { fulfillment: { id: `fulfillment-${id}`, status: 'SUCCESS' }, userErrors: [] } };
    },
  });
  return f;
}

test('checkout prepares every fulfillment order across pages after payment', async t => {
  const f = fulfillmentFixture(t);
  await f.service.checkout(key, checkoutInput);
  assert.equal(count(f, 'PosFulfill'), 2);
  assert.equal(count(f, 'PosFulfillmentOrders'), 2);
  assert.ok(f.calls.findIndex(c => c.name === 'PosPaid') < f.calls.findIndex(c => c.name === 'PosFulfill'));
  assert.ok(f.calls.filter(c => c.name === 'PosFulfill').every(c => c.variables.fulfillment.notifyCustomer === false));
  await f.service.checkout(key, checkoutInput);
  assert.equal(count(f, 'PosFulfill'), 2);
  assert.equal(f.store.read().movements.length, 1);
});

test('lost fulfillment response resumes without repeating payment, voucher debit or preparation', async t => {
  const f = fulfillmentFixture(t, { loseResponse: true });
  const input = { ...checkoutInput, payment: { method: 'VOUCHER', amount: 100, voucherCode: '1234' } };
  await assert.rejects(f.service.checkout(key, input), /ya cobrado/);
  assert.equal(f.store.read().movements.length, 1);
  assert.equal(f.store.read().operations[key].result, undefined);
  await createPosService(f.gql, createOperationStore(f.directory)).checkout(key, input);
  assert.equal(count(f, 'PosPaid'), 1);
  assert.equal(count(f, 'PosDebit'), 1);
  assert.equal(count(f, 'PosDraft'), 1);
  assert.equal(count(f, 'PosFulfill'), 2);
  assert.equal(f.store.read().movements.length, 1);
});

test('rejected fulfillment remains resumable after the sale is recorded', async t => {
  const f = fulfillmentFixture(t, { reject: true });
  await assert.rejects(f.service.checkout(key, checkoutInput), /ya cobrado/);
  await f.service.checkout(key, checkoutInput);
  assert.equal(count(f, 'PosPaid'), 1);
  assert.equal(f.store.read().movements.length, 1);
});

test('held fulfillment orders never report a completed checkout', async t => {
  const f = fulfillmentFixture(t, { hold: true });
  await assert.rejects(f.service.checkout(key, checkoutInput), /ya cobrado/);
  assert.equal(count(f, 'PosFulfill'), 0);
  assert.equal(f.store.read().operations[key].result, undefined);
  assert.equal(f.store.read().movements.length, 1);
});
