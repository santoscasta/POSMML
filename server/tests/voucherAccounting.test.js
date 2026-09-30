import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { lookupVoucher } from '../lib/voucherLookup.js';
import { reconcileSale } from '../lib/reconcileSale.js';
import { createOperationStore } from '../lib/operationStore.js';
import { computeKPIs, getPayments, newCollectedAmount } from '../lib/accounting.js';

const bundle = await build({ entryPoints: ['src/utils/saleReceipt.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { saleReceipt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const orderId = 'gid://shopify/Order/15046';
const payment = { method: 'MIXED', amount: 29.50, mixedPayments: [
  { method: 'VOUCHER', amount: 24.85, voucherCode: '****2e3a' }, { method: 'CARD', amount: 4.65 },
] };

test('lookup accepts upper/lowercase, full, masked and spaced voucher codes', async () => {
  for (const value of ['2E3A', '2e3a', 'B35B4B0C585A2E3A', '**** **** **** 2E3A', ' 2 e 3 a ']) {
    const card = await lookupVoucher(async (_, variables) => {
      assert.equal(variables.query, '2e3a');
      return { giftCards: { edges: [{ node: { id: 'voucher', lastCharacters: '2e3a' } }], pageInfo: { hasNextPage: false } } };
    }, value, 'id lastCharacters');
    assert.equal(card.id, 'voucher');
  }
});

test('lookup checks later pages and rejects ambiguous, missing and invalid codes', async () => {
  const gql = async (_, { after }) => ({ giftCards: { edges: [{ node: { id: after ? 'match' : 'other', lastCharacters: after ? '2E3A' : 'aaaa' } }], pageInfo: { hasNextPage: !after, endCursor: 'next' } } });
  assert.equal((await lookupVoucher(gql, '2e3a', 'id lastCharacters')).id, 'match');
  await assert.rejects(lookupVoucher(async () => ({ giftCards: { edges: ['a', 'b'].map(id => ({ node: { id, lastCharacters: '2e3a' } })), pageInfo: { hasNextPage: false } } }), '2E3A', 'id lastCharacters'), { status: 409 });
  await assert.rejects(lookupVoucher(async () => ({ giftCards: { edges: [], pageInfo: { hasNextPage: false } } }), '2e3a', 'id'), { status: 404 });
  await assert.rejects(lookupVoucher(() => { throw new Error('Must not query'); }, '2e', 'id'), /últimos cuatro/);
});

test('29.50 purchase collects 4.65 card, 24.85 voucher and no cash, also after reloading journal', async t => {
  const { store, directory } = fixture(t);
  const state = store.read();
  state.movements.push({ ...payment, type: 'sale', shopifyOrderId: orderId, shopifyOrderName: '#15046', sessionId: 'open', createdAt: '2026-09-30T10:50:00Z' });
  store.write(state);
  const movements = await getPayments(async () => ({ orders: { nodes: [], pageInfo: { hasNextPage: false } } }), createOperationStore(directory), { sessionId: 'open' });
  const kpis = computeKPIs(movements, 271.30);
  assert.equal(kpis.grossSales, 29.50);
  assert.equal(kpis.collectedSales, 4.65);
  assert.equal(kpis.cardSales, 4.65);
  assert.equal(kpis.voucherSales, 24.85);
  assert.equal(kpis.cashSales, 0);
  assert.equal(kpis.expectedCash, 271.30);
  assert.equal(newCollectedAmount(movements[0]), 4.65);
  const html = saleReceipt({ order: '#15046', date: '30/09/2026', method: 'Mixto', items: [], subtotal: 29.50, total: 29.50, discountAmount: 0, taxAmount: 5.12, payments: payment.mixedPayments });
  assert.match(html, /Vale 2E3A aplicado<\/span><span>-24,85/);
  assert.match(html, /Tarjeta pagado<\/span><span>4,65/);
  assert.match(html, /TOTAL COBRADO<\/span><span>4,65/);
  assert.match(html, /Efectivo a caja<\/span><span>0,00/);
});

test('each voucher in a mixed payment is identified separately and gift receipts hide them', () => {
  const data = { order: '#1', date: '', method: 'Mixto', items: [], subtotal: 29.50, total: 29.50, discountAmount: 0, taxAmount: 0,
    payments: [{ method: 'VOUCHER', amount: 20, voucherCode: '****2e3a' }, { method: 'VOUCHER', amount: 4.85, voucherCode: '****abcd' }, { method: 'CARD', amount: 4.65 }] };
  assert.match(saleReceipt(data), /Vale 2E3A aplicado/);
  assert.match(saleReceipt(data), /Vale ABCD aplicado/);
  assert.doesNotMatch(saleReceipt(data, true), /2E3A|ABCD|4,65|TOTAL COBRADO/);
});

test('unknown historical mixed payments remain unresolved instead of displaying a zero collection', () => {
  const incomplete = { type: 'sale', method: 'MIXED', amount: 29.50 };
  assert.equal(newCollectedAmount(incomplete), null);
  assert.throws(() => computeKPIs([incomplete]), { code: 'LEGACY_RECONCILIATION_REQUIRED' });
});

function fixture(t, orderChanges = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voucher-accounting-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createOperationStore(directory);
  const order = { id: orderId, name: '#15046', createdAt: '2026-09-30T10:50:00Z', tags: ['POS MML'], cancelledAt: null, displayFinancialStatus: 'PAID', totalPriceSet: { shopMoney: { amount: '29.50', currencyCode: 'EUR' } }, metafields: { nodes: [] }, ...orderChanges };
  const gql = async query => {
    assert.doesNotMatch(query, /mutation/);
    if (query.includes('PosSessions')) return { metaobjects: { nodes: [{ id: 'open', fields: [{ key: 'status', value: 'OPEN' }] }], pageInfo: { hasNextPage: false } } };
    return { order };
  };
  return { store, directory, order, gql };
}
const input = { sessionId: 'open', orderId, payment };

test('reconciliation records only the existing paid sale and cannot duplicate it', async t => {
  const f = fixture(t);
  await reconcileSale(f.gql, f.store, input);
  assert.equal(computeKPIs(f.store.read().movements).cardSales, 4.65);
  await assert.rejects(reconcileSale(f.gql, createOperationStore(f.directory), input), { status: 409 });
  assert.equal(f.store.read().movements.length, 1);
  const diagnostics = [];
  const historyGql = async () => ({ orders: { nodes: [f.order], pageInfo: { hasNextPage: false } } });
  assert.equal((await getPayments(historyGql, f.store, { sessionId: 'open', diagnostics })).length, 1);
  assert.deepEqual(diagnostics, []);
});

test('reconciliation cannot guess another session, overwrite history or bypass a pending operation', async t => {
  for (const changes of [{ tags: [] }, { displayFinancialStatus: 'PENDING' }, { displayFinancialStatus: 'PARTIALLY_REFUNDED' }, { cancelledAt: '2026-09-30' },
    { metafields: { nodes: [{ key: 'session_id', value: 'other' }] } },
    { metafields: { nodes: [{ key: 'payment_method', value: 'CARD' }, { key: 'session_id', value: 'open' }] } }]) {
    const f = fixture(t, changes);
    await assert.rejects(reconcileSale(f.gql, f.store, input));
    assert.equal(f.store.read().movements.length, 0);
  }
  const f = fixture(t);
  await assert.rejects(reconcileSale(f.gql, f.store, { ...input, sessionId: 'closed' }));
  await assert.rejects(reconcileSale(f.gql, f.store, { ...input, payment: { method: 'CARD', amount: 29.49 } }));
  const state = f.store.read();
  state.operations.pending = { input: {}, steps: { 'draft-complete': { value: { order: { id: orderId } } } } };
  f.store.write(state);
  await assert.rejects(reconcileSale(f.gql, f.store, input), /Reanuda/);
  assert.equal(f.store.read().movements.length, 0);
});
