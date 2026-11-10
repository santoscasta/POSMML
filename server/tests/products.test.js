import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { parse } from 'graphql';
import { updateProduct, updateVariant } from '../lib/products.js';
import { createProductsRouter } from '../routes/products.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOperationStore } from '../lib/operationStore.js';
import { createProduct, setVariantInventory, addVariant, uploadProductImage } from '../lib/products.js';

const productId = 'gid://shopify/Product/1';
const variantId = 'gid://shopify/ProductVariant/2';
const details = { title: 'Camiseta', vendor: 'Marca', productType: 'Ropa', status: 'DRAFT', tags: ['Verano'] };
const variantInput = { price: '19.95', sku: 'CAM-2', barcode: '0123456789' };

test('product update forwards only validated fields and surfaces Shopify validation errors', async () => {
  const updated = await updateProduct(async (query, variables) => {
    parse(query);
    assert.deepEqual(variables, { product: { id: productId, ...details } });
    return { productUpdate: { product: { id: productId, ...details }, userErrors: [] } };
  }, productId, { ...details, tags: ['Verano', 'Verano'], inventoryQuantity: 999, id: 'other' });
  assert.equal(updated.status, 'DRAFT');
  await assert.rejects(updateProduct(async () => ({ productUpdate: { product: null, userErrors: [{ message: 'Sin permisos de escritura' }] } }), productId, details), /Sin permisos/);
  await assert.rejects(updateProduct(async () => ({ productUpdate: { product: null, userErrors: [] } }), productId, details), error => error.status === 404);
});

test('invalid product inputs never reach Shopify', async () => {
  const gql = async () => assert.fail('Shopify must not be called');
  for (const body of [null, {}, { ...details, title: '   ' }, { ...details, status: 'PUBLISHED' }, { ...details, tags: [''] }, { ...details, tags: 'Verano' }, { ...details, vendor: null }]) {
    await assert.rejects(updateProduct(gql, productId, body), error => error.status === 400);
  }
  await assert.rejects(updateProduct(gql, '1', details), /Identificador/);
});

test('variant update preserves leading barcode zeros, uses inventoryItem for SKU, and does not change stock', async () => {
  const updated = await updateVariant(async (query, variables) => {
    parse(query);
    assert.match(query, /allowPartialUpdates: false/);
    assert.deepEqual(variables, { productId, variants: [{ id: variantId, price: '19.95', barcode: '0123456789', inventoryItem: { sku: 'CAM-2' } }] });
    return { productVariantsBulkUpdate: { productVariants: [{ id: variantId, ...variantInput, inventoryQuantity: 4 }], userErrors: [] } };
  }, productId, variantId, { ...variantInput, inventoryQuantity: 999 });
  assert.equal(updated.barcode, '0123456789');
  assert.equal(updated.inventoryQuantity, 4);
});

test('invalid prices and identifiers are rejected before any variant mutation', async () => {
  const gql = async () => assert.fail('Shopify must not be called');
  for (const price of ['', '-1', '2.555', 'NaN', 'Infinity', '2,50', '1e2', 19.95, '1000000000']) {
    await assert.rejects(updateVariant(gql, productId, variantId, { ...variantInput, price }), /precio/);
  }
  await assert.rejects(updateVariant(gql, productId, productId, variantInput), /Identificador/);
  assert.equal((await updateVariant(async () => ({ productVariantsBulkUpdate: { productVariants: [{ id: variantId, price: '0' }], userErrors: [] } }), productId, variantId, { ...variantInput, price: '0' })).price, '0');
});

test('variant ownership errors and unconfirmed updates are reported without success', async () => {
  await assert.rejects(updateVariant(async () => ({ productVariantsBulkUpdate: { productVariants: [], userErrors: [{ message: 'La variante no pertenece al producto' }] } }), productId, variantId, variantInput), /no pertenece/);
  await assert.rejects(updateVariant(async () => ({ productVariantsBulkUpdate: { productVariants: [], userErrors: [] } }), productId, variantId, variantInput), error => error.status === 502);
});

test('product routes require an administrator and return validation failures', async t => {
  const app = express();
  let calls = 0;
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { role: req.headers['x-test-role'] || 'collaborator' }; next(); });
  app.use('/api', createProductsRouter(async () => {
    calls++;
    return { productUpdate: { product: { id: productId, ...details }, userErrors: [] } };
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/products/${encodeURIComponent(productId)}`;
  const post = (path, body, role = 'collaborator') => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
  assert.equal((await post(url, details)).status, 403);
  assert.equal((await post(`${url}/variants/${encodeURIComponent(variantId)}`, variantInput)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await post(url.replace(/\/[^/]+$/, ''), {})).status, 403);
  assert.equal((await post(`${url}/images`, { url: 'https://example.com/image.jpg' })).status, 403);
  assert.equal((await post(`${url}/variants`, {})).status, 403);
  assert.equal((await post(`${url}/variants/${encodeURIComponent(variantId)}/inventory`, {})).status, 403);
  assert.equal((await post(url, {}, 'admin')).status, 400);
  const response = await post(url, details, 'admin');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, productId);
  assert.equal(calls, 1);
});

test('creation is durable and reconciles an unknown response without creating twice', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-products-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createOperationStore(directory);
  const body = { ...details, operationId: randomUUID(), categoryIds: [], variants: [{ name: '6 años', ...variantInput }] };
  let mutations = 0;
  const product = { id: productId, ...details, variants: { edges: [{ node: { id: variantId, ...variantInput } }] } };
  const gql = async query => {
    parse(query);
    if (query.includes('mutation')) { mutations++; throw new Error('Connection lost after Shopify created the product'); }
    return { products: { nodes: [product] } };
  };
  await assert.rejects(createProduct(gql, body, store), error => error.code === 'RECONCILIATION_REQUIRED');
  const recovered = await createProduct(gql, body, createOperationStore(directory));
  assert.equal(recovered.id, productId);
  assert.equal(recovered.variants[0].id, variantId);
  assert.equal((await createProduct(gql, body, store)).id, productId);
  assert.equal(mutations, 1);
  await assert.rejects(createProduct(gql, { ...body, title: 'Different' }, store), error => error.code === 'CONFLICT');
});

for (const modern of [true, false]) test(`stock uses a concurrent-quantity check with ${modern ? 'current' : 'legacy'} Shopify schema`, async () => {
  let quantity = 3, mutations = 0;
  const locationId = 'gid://shopify/Location/1', inventoryItemId = 'gid://shopify/InventoryItem/1';
  const gql = async (query, variables) => {
    parse(query);
    if (query.includes('PosVariantInventory')) return { productVariant: { product: { id: productId, totalInventory: quantity }, inventoryQuantity: quantity, inventoryItem: { id: inventoryItemId, tracked: true } } };
    if (query.includes('PosInventoryLevels')) return { inventoryItem: { inventoryLevels: { nodes: [{ location: { id: locationId }, quantities: [{ name: 'available', quantity }] }], pageInfo: { hasNextPage: false } } } };
    if (query.includes('PosInventoryLocations')) return { locations: { nodes: [{ id: locationId, name: 'Tienda', isActive: true }], pageInfo: { hasNextPage: false } } };
    if (query.includes('PosInventorySchema')) return { __type: { inputFields: [{ name: modern ? 'changeFromQuantity' : 'compareQuantity' }] } };
    if (query.includes('PosSetProductInventory')) {
      mutations++;
      assert.deepEqual(variables.input.quantities, [{ inventoryItemId, locationId, quantity: 7, [modern ? 'changeFromQuantity' : 'compareQuantity']: 3 }]);
      assert.equal(query.includes('@idempotent'), modern);
      if (!modern) assert.equal(variables.input.ignoreCompareQuantity, false);
      quantity = 7;
      return { inventorySetQuantities: { inventoryAdjustmentGroup: { reason: 'correction' }, userErrors: [] } };
    }
    assert.fail('Unexpected query');
  };
  const body = { locationId, previous: 3, quantity: 7, operationId: randomUUID() };
  assert.equal((await setVariantInventory(gql, productId, variantId, body)).inventoryQuantity, 7);
  await assert.rejects(setVariantInventory(gql, productId, variantId, body), error => error.status === 409);
  assert.equal(mutations, 1);
});

test('adding variants validates every option before writing to Shopify', async () => {
  const gql = async () => assert.fail('No mutation expected');
  for (const options of [[], null, [{ name: 'Talla', value: '' }], [null]]) await assert.rejects(addVariant(gql, productId, { ...variantInput, options }), error => error.status === 400);
});

test('image upload rejects invalid bytes before staging and checks upload response before adding media', async () => {
  const invalid = async () => assert.fail('Shopify must not be called');
  await assert.rejects(uploadProductImage(invalid, productId, Buffer.from('not-png'), 'image/png', 'photo.png'), /imagen JPG/);
  await assert.rejects(uploadProductImage(invalid, productId, Buffer.alloc(8 * 1024 * 1024 + 1), 'image/png', 'photo.png'), /8 MB/);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let mediaCalls = 0;
  const gql = async (query, variables) => {
    parse(query);
    if (query.includes('PosStageProductImage')) {
      assert.equal(variables.input[0].resource, 'PRODUCT_IMAGE');
      return { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example', resourceUrl: 'https://image.example/photo.png', parameters: [{ name: 'key', value: 'upload-key' }] }], userErrors: [] } };
    }
    mediaCalls++;
    assert.equal(variables.media[0].originalSource, 'https://image.example/photo.png');
    return { productUpdate: { product: { id: productId }, userErrors: [] } };
  };
  await assert.rejects(uploadProductImage(gql, productId, png, 'image/png', 'photo.png', async () => ({ ok: false })), /subir la imagen/);
  assert.equal(mediaCalls, 0);
  assert.equal((await uploadProductImage(gql, productId, png, 'image/png', 'photo.png', async (_url, options) => {
    assert.equal(options.body.get('key'), 'upload-key');
    assert.equal(options.body.get('file').size, png.length);
    return { ok: true };
  })).id, productId);
});
