import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { parse } from 'graphql';
import { readProduct, readProductHistory } from '../lib/productRead.js';
import { createProductsRouter } from '../routes/products.js';

const id = 'gid://shopify/Product/123';
const connection = (nodes, after = null) => ({ nodes, pageInfo: { hasNextPage: Boolean(after), endCursor: after } });

test('read-only product snapshot completes variants and photos without performing mutations', async () => {
  const calls = [];
  const gql = async (query, variables) => {
    const document = parse(query);
    assert(document.definitions.every(definition => definition.operation === 'query'));
    assert.equal(variables.id, id);
    calls.push(variables);
    if (query.includes('PosReadProductVariants')) return { product: { variants: connection([{ id: 'v2' }, { id: 'v1' }]) } };
    if (query.includes('PosReadProductImages')) return { product: { images: connection([{ id: 'photo2' }]) } };
    return { shop: { myshopifyDomain: 'test-shop.myshopify.com' }, product: {
      id, title: 'Camiseta', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z',
      categoryMembership: { value: '["category1"]', references: { nodes: [{ id: 'category1', displayName: 'Ropa' }] } },
      variants: connection([{ id: 'v1' }], 'variants-next'), images: connection([{ id: 'photo1' }], 'images-next'),
    } };
  };
  const product = await readProduct(gql, id);
  assert.deepEqual(product.variants.map(variant => variant.id), ['v1', 'v2']);
  assert.deepEqual(product.images.map(image => image.id), ['photo1', 'photo2']);
  assert.deepEqual(product.categoryIds, ['category1']);
  assert.equal(product.categories[0].displayName, 'Ropa');
  assert.equal(product.adminUrl, 'https://admin.shopify.com/store/test-shop/products/123');
  assert.deepEqual(calls.map(call => call.after), [undefined, 'variants-next', 'images-next']);
});

test('missing products, invalid IDs and malformed continuation pages fail explicitly', async () => {
  const never = async () => assert.fail('No request expected');
  for (const value of ['123', '', null, 'gid://shopify/Order/123']) {
    await assert.rejects(readProduct(never, value), error => error.status === 400);
    await assert.rejects(readProductHistory(never, value), error => error.status === 400);
  }
  await assert.rejects(readProduct(async () => ({ product: null }), id), error => error.status === 404);
  await assert.rejects(readProductHistory(async () => ({ product: null }), id), error => error.status === 404);
  let calls = 0;
  await assert.rejects(readProduct(async () => {
    calls++;
    return calls === 1 ? { shop: { myshopifyDomain: 'test.myshopify.com' }, product: { variants: connection([], 'repeat'), images: connection([]) } }
      : { product: { variants: connection([], 'repeat') } };
  }, id), error => error.status === 502);
  assert.equal(calls, 2);
});

test('history is scoped to the selected product, paginated, and sends formatted messages as text', async () => {
  const page = await readProductHistory(async (query, variables) => {
    parse(query);
    assert.match(query, /product\(id: \$id\)/);
    assert.match(query, /reverse: true/);
    assert.doesNotMatch(query, /mutation/);
    assert.deepEqual(variables, { id, after: 'previous-page' });
    return { product: { events: connection([{ id: 'event1', message: 'Ana actualiz&#243; <a href="https://example.com">Camiseta</a> &amp; talla 6.', createdAt: '2026-11-10T09:00:00Z', action: 'update', author: 'Ana', appTitle: 'POS MML' }], 'next-page') } };
  }, id, 'previous-page');
  assert.equal(page.events[0].message, 'Ana actualizó Camiseta & talla 6.');
  assert.equal(page.events[0].author, 'Ana');
  assert.equal(page.nextCursor, 'next-page');
  const empty = await readProductHistory(async () => ({ product: { events: connection([]) } }), id);
  assert.deepEqual(empty, { events: [], nextCursor: null });
});

test('history rejects invalid or repeated cursors and never invents an event', async () => {
  for (const value of ['', ['multiple'], 'x'.repeat(2049), 'bad\npage']) {
    await assert.rejects(readProductHistory(async () => assert.fail('No query expected'), id, value), error => error.status === 400);
  }
  await assert.rejects(readProductHistory(async () => ({ product: { events: connection([], 'repeat') } }), id, 'repeat'), error => error.status === 502);
});

test('product and history GET routes are restricted to administrators and leave Shopify untouched', async t => {
  let calls = 0;
  const app = express();
  app.use((req, _res, next) => { req.user = { role: req.headers['x-test-role'] || 'collaborator' }; next(); });
  app.use('/api', createProductsRouter(async query => {
    calls++;
    assert.doesNotMatch(query, /mutation/);
    return { product: { events: connection([]) } };
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/products/${encodeURIComponent(id)}`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url + '/history')).status, 403);
  assert.equal(calls, 0);
  const response = await fetch(url + '/history', { headers: { 'x-test-role': 'admin' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { events: [], nextCursor: null });
  assert.equal(calls, 1);
});
