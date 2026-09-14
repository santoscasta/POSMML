import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createOperationStore } from '../lib/operationStore.js';
import { issueVoucher, allGiftCards } from '../lib/voucherIssue.js';

const key = 'qa-voucher-operation-0001';
const input = { amount: 20, customerName: 'QA' };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-regression-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createOperationStore(directory) };
}

test('manual voucher recovers lost response after store recreation without issuing twice', async t => {
  const { directory, store } = fixture(t);
  let created, calls = 0;
  const gql = async (query, variables) => {
    if (query.includes('mutation IssuePosVoucher')) {
      calls++;
      created = { id: 'gift-1', lastCharacters: variables.input.code.slice(-4), note: variables.input.note, initialValue: { amount: '20' } };
      throw new Error('Response lost after creation');
    }
    return { giftCards: { nodes: [created], pageInfo: { hasNextPage: false } } };
  };
  await assert.rejects(issueVoucher(gql, store, key, input, 'id'), { code: 'RECONCILIATION_REQUIRED' });
  const savedCode = store.read().operations[key].giftCardCode;
  await assert.rejects(issueVoucher(gql, store, 'another-voucher-operation', input, 'id'), { code: 'PENDING' });
  const result = await issueVoucher(gql, createOperationStore(directory), key, input, 'id');
  assert.equal(result.card.id, 'gift-1');
  assert.equal(result.fullCode, savedCode);
  assert.deepEqual(await issueVoucher(gql, store, key, input, 'id'), result);
  assert.equal(calls, 1);
});

test('unknown manual voucher outcome cannot be replayed when recovery finds no match', async t => {
  const { store } = fixture(t); let calls = 0;
  const gql = async query => {
    if (query.includes('mutation')) { calls++; throw new Error('Timeout'); }
    return { giftCards: { nodes: [], pageInfo: { hasNextPage: false } } };
  };
  await assert.rejects(issueVoucher(gql, store, key, input, 'id'));
  await assert.rejects(issueVoucher(gql, store, key, input, 'id'), { code: 'RECONCILIATION_REQUIRED' });
  assert.equal(calls, 1);
});

test('manual voucher rejection and invalid cents allow a safe corrected attempt', async t => {
  const { store } = fixture(t);
  const gql = async () => ({ giftCardCreate: { giftCard: null, userErrors: [{ message: 'Rejected' }] } });
  await assert.rejects(issueVoucher(gql, store, key, input, 'id'), error => error.safeToRestart === true);
  assert.equal(store.read().operations[key], undefined);
  await assert.rejects(issueVoucher(gql, store, key, { amount: 0.001 }, 'id'), error => error.safeToRestart === true);
});

test('voucher pagination loads beyond both the 50-card list and 250-card stats limits', async () => {
  const source = Array.from({ length: 263 }, (_, index) => ({ id: String(index) }));
  const gql = async (_, { first, after }) => {
    const start = Number(after || 0), end = Math.min(start + first, source.length);
    return { giftCards: { edges: source.slice(start, end).map(node => ({ node })), pageInfo: { hasNextPage: end < source.length, endCursor: String(end) } } };
  };
  assert.deepEqual(await allGiftCards(gql, 'id', 10), source);
  assert.deepEqual(await allGiftCards(gql, 'id', 100), source);
  let calls = 0;
  await assert.rejects(allGiftCards(async () => { calls++; return { giftCards: { edges: [], pageInfo: { hasNextPage: true, endCursor: 'same' } } }; }, 'id'), /todos los vales/);
  assert.equal(calls, 2);
});

test('forced opening stops if Shopify rejects closing the previous session', async t => {
  const { directory } = fixture(t);
  process.env.POS_DATA_DIR = directory;
  process.env.SHOPIFY_ACCESS_TOKEN = 'qa-fake-token';
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const session = { id: 'gid://shopify/Metaobject/1', updatedAt: '2026-09-14T08:00:00Z', fields: [{ key: 'status', value: 'OPEN' }] };
  let creates = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes('/admin/api/')) return originalFetch(url, options);
    const { query } = JSON.parse(options.body); let data;
    if (query.includes('metaobjectUpdate')) data = { metaobjectUpdate: { metaobject: null, userErrors: [{ message: 'Close rejected' }] } };
    else if (query.includes('metaobjectCreate')) { creates++; throw new Error('Must not create'); }
    else data = { metaobjects: { edges: [{ node: session }] } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const { default: router } = await import('../routes/sessions.js');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/sessions/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openingAmount: 50, force: true }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Close rejected/);
  assert.equal(creates, 0);
});
