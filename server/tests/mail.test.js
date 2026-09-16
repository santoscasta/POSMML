import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationStore } from '../lib/operationStore.js';
import { createMailService, defaults, smtpConfig } from '../lib/mail/service.js';
import { message } from '../lib/mail/templates.js';
import { queueGiftReceipt } from '../lib/mail/giftReceipt.js';
import { createMailMonitor, localDate } from '../lib/mail/monitor.js';

async function fixture(t, sendMail = async () => ({ accepted: ['recipient@example.com'] })) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-mail-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let time = Date.parse('2026-09-16T10:00:00Z');
  const now = () => time;
  const store = createOperationStore(path.join(directory, 'mail'));
  const posStore = createOperationStore(path.join(directory, 'pos'));
  const config = { configured: true, from: 'shop@example.com' };
  const calls = [];
  const transport = { sendMail: async value => { calls.push(value); return sendMail(value); } };
  const mail = createMailService({ store, config, transport, now });
  await mail.settings({ ...defaults, recipient: 'manager@example.com', enabled: true });
  return { directory, store, posStore, mail, calls, config, transport, now, advance: ms => { time += ms; } };
}

test('SMTP configuration requires credentials, one sender and encrypted supported ports', () => {
  assert.equal(smtpConfig({}).configured, false);
  assert.equal(smtpConfig({ SMTP_HOST: 'smtp.test', SMTP_FROM: 'x@example.com', SMTP_USER: 'x', SMTP_PASSWORD: 'secret', SMTP_PORT: '25' }).configured, false);
  const config = smtpConfig({ SMTP_HOST: 'smtp.test', SMTP_FROM: 'x@example.com', SMTP_USER: 'x', SMTP_PASSWORD: 'secret', SMTP_PORT: '465' });
  assert.equal(config.configured, true);
  assert.equal(config.options.secure, true);
  assert.equal(config.options.requireTLS, true);
});

test('persistent queue deduplicates repeated requests and records SMTP acceptance', async t => {
  const f = await fixture(t);
  const first = await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', ['Hola <script>']));
  const restarted = createMailService({ store: f.store, config: f.config, transport: f.transport, now: f.now });
  assert.equal((await restarted.enqueue('gift:1', 'customer@example.com', message('Regalo', []))).id, first.id);
  await restarted.flush(); await f.mail.flush();
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].html, /&lt;script&gt;/);
  assert.equal(f.mail.status().jobs[0].status, 'sent');
  assert.equal(f.mail.status().jobs[0].html, undefined);
  assert.equal(JSON.stringify(f.mail.status()).includes('secret'), false);
});

test('unknown SMTP outcome is never automatically resent, explicit confirmation is required', async t => {
  const f = await fixture(t, async () => { const error = new Error('Socket lost'); error.command = 'DATA'; throw error; });
  const job = await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []));
  await f.mail.flush();
  assert.equal(f.mail.read().jobs[job.id].status, 'unknown');
  await assert.rejects(f.mail.retry(job.id), /Confirma/);
  await f.mail.flush();
  assert.equal(f.calls.filter(c => c.to === 'customer@example.com').length, 1);
  await f.mail.retry(job.id, true);
  assert.equal(f.mail.read().jobs[job.id].status, 'queued');
});

test('temporary rejection retries with backoff, stops at three; failures do not recursively alert', async t => {
  const f = await fixture(t, async () => { const error = new Error('Try later'); error.responseCode = 451; throw error; });
  const job = await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []));
  await f.mail.flush(); await f.mail.flush();
  assert.equal(f.calls.length, 1);
  f.advance(300000); await f.mail.flush();
  f.advance(300000); await f.mail.flush();
  assert.equal(f.mail.read().jobs[job.id].status, 'failed');
  assert.equal(Object.values(f.mail.read().jobs).filter(j => j.category === 'deliveryFailures').length, 1);
});

test('crash after claim marks the mail as unconfirmed instead of resending', async t => {
  const f = await fixture(t);
  const job = await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []));
  await f.mail.change(data => { data.jobs[job.id].status = 'sending'; data.jobs[job.id].startedAt = f.now(); });
  f.advance(180000);
  await f.mail.flush();
  assert.equal(f.mail.read().jobs[job.id].status, 'unknown');
  assert.equal(f.calls.filter(c => c.to === 'customer@example.com').length, 0);
});

test('disabling mail cancels queued jobs and blocks gift mail until configured', async t => {
  const f = await fixture(t);
  const job = await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []));
  await f.mail.settings({ ...f.mail.read().settings, enabled: false });
  await f.mail.flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.mail.read().jobs[job.id].status, 'cancelled');
  await assert.rejects(f.mail.enqueue('new', 'a@example.com', message('X', [])), /activado/);
  await assert.rejects(f.mail.settings({ ...defaults, enabled: true, recipient: 'a@example.com\r\nBcc: b@example.com' }), /inválido/);
  await f.mail.settings({ ...f.mail.read().settings, enabled: true });
  assert.equal((await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []))).status, 'queued');
});

test('gift email loads all order lines from Shopify without fetching or rendering amounts', async t => {
  const f = await fixture(t);
  const state = f.posStore.read();
  state.movements.push({ id: 'sale1', type: 'sale', shopifyOrderName: '#100', shopifyOrderId: 'gid://shopify/Order/1' });
  f.posStore.write(state);
  let calls = 0;
  const gql = async (query, { after }) => {
    calls++;
    assert.doesNotMatch(query, /price|total|payment|note|email/i);
    return { order: { id: 'gid://shopify/Order/1', name: '#100', createdAt: '2026-09-16T10:00:00Z', lineItems: {
      nodes: [{ title: after ? 'Botella' : 'Vestido <rosa>', variantTitle: 'Default Title', quantity: 1 }],
      pageInfo: { hasNextPage: !after, endCursor: 'next' },
    } } };
  };
  await queueGiftReceipt(gql, f.posStore, f.mail, { order: '#100', email: 'customer@example.com' });
  await f.mail.flush();
  assert.equal(calls, 2);
  assert.match(f.calls[0].html, /Vestido &lt;rosa&gt;/);
  assert.match(f.calls[0].text, /Botella/);
  assert.match(f.calls[0].text, /607140250/);
  assert.doesNotMatch(f.calls[0].text, /€|Subtotal|IVA|TOTAL/);
  await assert.rejects(queueGiftReceipt(gql, f.posStore, f.mail, { order: '#999', email: 'customer@example.com' }), /Venta no encontrada/);
});

function remoteFixture() {
  let sessions = [], stock = [];
  const calls = [];
  const gql = async (query, variables) => {
    const name = query.match(/query (\w+)/)?.[1]; calls.push(name);
    if (name === 'PosMailSessions') return { metaobjects: { nodes: sessions, pageInfo: { hasNextPage: false } } };
    if (name === 'PosPaymentHistory') return { orders: { nodes: [], pageInfo: { hasNextPage: false } } };
    if (name === 'PosMailStock') {
      const offset = variables.after ? 1 : 0;
      return { productVariants: { nodes: stock.slice(offset, offset + 1).map(([id, quantity]) => ({ id, displayName: id, inventoryQuantity: quantity, inventoryItem: { tracked: true }, product: { status: 'ACTIVE' } })), pageInfo: { hasNextPage: !offset && stock.length > 1, endCursor: 'next' } } };
    }
    throw new Error(`Unexpected ${name}`);
  };
  return { gql, calls, setSessions: value => { sessions = value; }, setStock: value => { stock = value; } };
}
const session = (id, status, openedAt, closedAt = '') => ({ id, updatedAt: openedAt, fields: Object.entries({ status, opening_amount: '10', closing_amount: '35', cashier_name: 'Celia', closed_at: closedAt }).map(([key, value]) => ({ key, value })) });

test('pending paid operation alerts once, resolves before delivery without sending stale warning', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  const state = f.posStore.read();
  state.operations.sale = { key: 'sale', kind: 'checkout', createdAt: new Date(f.now() - 600000).toISOString() };
  state.movements.push({ id: 'sale', type: 'sale', shopifyOrderName: '#100' }); f.posStore.write(state);
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now });
  await monitor.scan(); await monitor.scan();
  const jobs = Object.values(f.mail.read().jobs);
  assert.equal(jobs.length, 1); assert.match(jobs[0].text, /No vuelvas a cobrar/);
  state.operations.sale.result = { success: true }; f.posStore.write(state);
  await monitor.tick();
  assert.equal(f.mail.read().jobs[jobs[0].id].status, 'cancelled'); assert.equal(f.calls.length, 0);
});

test('new closing has accurate cash and discrepancy, old closings are not emailed', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  const state = f.posStore.read();
  state.movements.push({ id: 'sale', sessionId: 'new', type: 'sale', amount: 30, method: 'MIXED', mixedPayments: [{ method: 'CASH', amount: 20 }, { method: 'CARD', amount: 10 }], createdAt: new Date(f.now()).toISOString() });
  state.movements.push({ id: 'refund', sessionId: 'new', type: 'refund', amount: 5, method: 'CASH', createdAt: new Date(f.now()).toISOString() });
  f.posStore.write(state);
  remote.setSessions([session('new', 'CLOSED', '2026-09-16T08:00:00Z', '2026-09-16T10:01:00Z'), session('old', 'CLOSED', '2026-09-15T08:00:00Z', '2026-09-15T10:00:00Z')]);
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now });
  await monitor.scan(); await monitor.scan();
  const jobs = Object.values(f.mail.read().jobs);
  assert.equal(jobs.length, 2);
  assert.match(jobs.find(j => j.category === 'closing').text, /Efectivo esperado: 25,00/);
  assert.match(jobs.find(j => j.category === 'discrepancy').text, /Diferencia: 10,00/);
});

test('stock baseline avoids a flood, all pages are read and each threshold transition alerts once', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  await f.mail.settings({ ...f.mail.read().settings, security: false, stockAlerts: true });
  // Ignore the settings-change audit which used the previous security preference.
  await f.mail.change(data => { data.jobs = {}; });
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now });
  remote.setStock([['a', 5], ['b', 2]]); await monitor.scan();
  assert.equal(Object.keys(f.mail.read().monitor.stock).length, 2); assert.equal(Object.keys(f.mail.read().jobs).length, 0);
  remote.setStock([['a', 3], ['b', 0]]); f.advance(16 * 60000); await monitor.scan(); await monitor.scan();
  assert.equal(Object.values(f.mail.read().jobs).filter(j => j.category === 'stockAlerts').length, 2);
  remote.setStock([['a', 5], ['b', 4]]); f.advance(16 * 60000); await monitor.scan();
  remote.setStock([['a', 0], ['b', -1]]); f.advance(16 * 60000); await monitor.scan();
  assert.equal(Object.values(f.mail.read().jobs).filter(j => j.category === 'stockAlerts').length, 4);
});

test('daily report uses full Madrid calendar days and survives monitor recreation', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  const state = f.posStore.read();
  state.movements.push({ id: 'sale', type: 'sale', amount: 30, method: 'CARD', createdAt: '2026-09-16T21:59:00Z' });
  state.movements.push({ id: 'tomorrow', type: 'sale', amount: 50, method: 'CARD', createdAt: '2026-09-16T22:01:00Z' });
  f.posStore.write(state); f.advance(86400000);
  const options = { mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now };
  await createMailMonitor(options).scan(); await createMailMonitor(options).scan();
  const jobs = Object.values(f.mail.read().jobs).filter(j => j.category === 'dailySales');
  assert.equal(jobs.length, 1); assert.match(jobs[0].text, /30,00/); assert.doesNotMatch(jobs[0].text, /80,00/);
  assert.equal(localDate('2026-10-25T23:30:00Z'), '2026-10-26');
});

test('three consecutive remote failures alert once, recovery cancels an unsent alert', async t => {
  const f = await fixture(t); let failing = true; const remote = remoteFixture();
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, now: f.now,
    gql: (...args) => { if (failing) throw new Error('Secret connection data'); return remote.gql(...args); } });
  await monitor.tick(); await monitor.tick(); assert.equal(f.calls.length, 0);
  await monitor.tick(); await monitor.tick(); assert.equal(f.calls.length, 1);
  assert.doesNotMatch(f.calls[0].text, /Secret/);
  failing = false; await monitor.tick(); assert.equal(f.mail.status().monitor.lastError, null);
});

test('two workers claim a queued message only once', async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, async () => { await wait; return { accepted: ['customer@example.com'] }; });
  await f.mail.enqueue('gift:1', 'customer@example.com', message('Regalo', []));
  const worker = f.mail.flush();
  await new Promise(resolve => setImmediate(resolve));
  const other = createMailService({ store: createOperationStore(path.join(f.directory, 'mail')), config: f.config, transport: f.transport, now: f.now });
  await other.flush();
  assert.equal(f.calls.length, 1);
  release(); await worker;
});

test('cash close reminder and changed credentials alert once and contain no password', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  remote.setSessions([session('open', 'OPEN', '2026-09-16T08:00:00Z')]);
  let credentials = 'caja:first-password';
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now, credentials: () => credentials });
  await monitor.scan(); assert.equal(Object.keys(f.mail.read().jobs).length, 0);
  f.advance(10 * 3600000); credentials = 'caja:second-password';
  await monitor.scan(); await monitor.scan();
  const jobs = Object.values(f.mail.read().jobs);
  assert.equal(jobs.filter(j => j.category === 'unclosed').length, 1);
  assert.equal(jobs.filter(j => j.category === 'security').length, 1);
  assert.doesNotMatch(JSON.stringify(jobs), /first-password|second-password/);
});

test('partial stock scan failure leaves the previous complete snapshot unchanged', async t => {
  const f = await fixture(t); const remote = remoteFixture();
  await f.mail.settings({ ...f.mail.read().settings, stockAlerts: true });
  remote.setStock([['a', 10], ['b', 10]]);
  const monitor = createMailMonitor({ mail: f.mail, posStore: f.posStore, gql: remote.gql, now: f.now });
  await monitor.scan();
  remote.setStock([['a', 0], ['b', 0]]); f.advance(16 * 60000);
  const broken = createMailMonitor({ mail: f.mail, posStore: f.posStore, now: f.now, gql: (query, vars) => {
    if (query.includes('PosMailStock') && vars.after) throw new Error('second page failed');
    return remote.gql(query, vars);
  } });
  await assert.rejects(broken.scan(), /second page/);
  assert.equal(f.mail.read().monitor.stock.a.quantity, 10);
  assert.equal(Object.values(f.mail.read().jobs).filter(j => j.category === 'stockAlerts').length, 0);
});
