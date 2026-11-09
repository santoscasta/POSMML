import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

// Minification must also preserve the self-contained script sent to the ticket.
const bundle = await build({ entryPoints: ['src/utils/print.ts'], bundle: true, write: false, minify: true, format: 'iife', globalName: 'ReceiptPrinting', target: 'es2023' });

function browser({ throws = false } = {}) {
  const channels = new Map();
  const timers = new Map();
  const documents = new Map();
  const opens = [];
  const revoked = [];
  let timerId = 0;
  class Channel {
    constructor(name) { this.name = name; channels.set(name, this); }
    close() { this.closed = true; }
  }
  const context = vm.createContext({
    window: {
      location: { href: 'https://pos.example/caja?foo=1&bar=2' },
      open(...args) { opens.push(args); if (throws) throw new Error('Blocked'); return null; },
      print() { throw new Error('Printing must never run in the POS window'); },
    },
    crypto: { randomUUID }, Blob, BroadcastChannel: Channel, performance,
    URL: {
      createObjectURL(blob) { const url = `blob:ticket-${documents.size}`; documents.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { print: context.ReceiptPrinting.printDocument, opens, channels, timers, documents, revoked };
}

const receipt = '<!doctype html><html><head><title>Ticket #1</title></head><body><img src="/logo-myminileo.jpg" alt="My mini Leo"><p>Artículo · 12,00 €</p></body></html>';

test('an independent ticket confirms opening even though noopener returns null', async () => {
  const b = browser();
  const opened = b.print(receipt);
  assert.deepEqual(b.opens[0], ['blob:ticket-0', '_blank', 'noopener']);
  assert.equal(b.revoked.length, 0);
  const channel = [...b.channels.values()][0];
  channel.onmessage({ data: 'ready' });
  assert.equal(await opened, true);
  // Continue receiving beforeprint/afterprint and closure for this ticket.
  assert.equal(channel.closed, undefined);
  assert.equal(b.timers.size, 1);
  assert.deepEqual(b.revoked, ['blob:ticket-0']);
  channel.onmessage({ data: { event: 'print.window_closed' } });
  assert.equal(channel.closed, true);
  assert.equal(b.timers.size, 0);
  const html = await b.documents.get('blob:ticket-0').text();
  assert.ok(html.includes('Artículo · 12,00 €'));
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<base href="https:\/\/pos.example\/caja\?foo=1&amp;bar=2">/);
  assert.match(html, /<img loading="lazy" src="\/logo-myminileo.jpg"/);
  // The bundled ticket script is valid standalone JavaScript.
  new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
});

test('a blocked ticket reports failure and releases its channel and document', async () => {
  const b = browser();
  const opened = b.print(receipt);
  [...b.timers.values()][0]();
  assert.equal(await opened, false);
  assert.equal([...b.channels.values()][0].closed, true);
  assert.equal(b.timers.size, 0);
  assert.deepEqual(b.revoked, ['blob:ticket-0']);
});

test('an exception opening the ticket reports failure without leaving a timer', async () => {
  const b = browser({ throws: true });
  assert.equal(await b.print(receipt), false);
  assert.equal(b.timers.size, 0);
  assert.equal([...b.channels.values()][0].closed, true);
  assert.deepEqual(b.revoked, ['blob:ticket-0']);
});

test('concurrent tickets cannot confirm each other or treat other messages as ready', async () => {
  const b = browser();
  const first = b.print(receipt);
  const second = b.print(receipt);
  const channels = [...b.channels.values()];
  assert.notEqual(channels[0].name, channels[1].name);
  channels[0].onmessage({ data: 'unrelated' });
  assert.equal(b.timers.size, 4);
  channels[1].onmessage({ data: 'ready' });
  assert.equal(await second, true);
  channels[1].onmessage({ data: { event: 'print.window_closed' } });
  [...b.timers.values()][0]();
  assert.equal(await first, false);
  assert.equal(b.timers.size, 0);
});
