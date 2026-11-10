import path from 'node:path';
import { PosError, createOperationStore } from './operationStore.js';

const PRODUCT_FIELDS = 'id title description vendor productType tags status categoryMembership: metafield(namespace: "custom", key: "categorias") { value }';
const VARIANT_FIELDS = 'id title price sku barcode inventoryQuantity selectedOptions { name value } image { url altText }';

function gid(value, kind) {
  if (typeof value !== 'string' || !new RegExp(`^gid://shopify/${kind}/[0-9]+$`).test(value)) {
    throw new PosError('Identificador de producto o variante no válido.');
  }
  return value;
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new PosError(`${label}: valor no válido.`);
  }
  return value.trim();
}

function result(payload, field) {
  if (!payload) throw new PosError('Shopify no ha confirmado los cambios. Actualiza el catálogo antes de reintentar.', 502);
  if (payload.userErrors?.length) {
    const error = new PosError(payload.userErrors.map(error => error.message).join(' · '));
    error.definiteRejection = true;
    throw error;
  }
  if (!payload[field]) throw new PosError('El producto ya no está disponible.', 404);
  return payload[field];
}

function details(body) {
  const product = {
    title: text(body?.title, 'Nombre', 255, true),
    vendor: text(body?.vendor, 'Marca', 255),
    productType: text(body?.productType, 'Tipo de producto', 255),
    status: body?.status,
  };
  if (!['ACTIVE', 'DRAFT', 'ARCHIVED'].includes(product.status)) throw new PosError('Estado de producto no válido.');
  if (!Array.isArray(body?.tags) || body.tags.length > 250) throw new PosError('Etiquetas no válidas.');
  product.tags = [...new Set(body.tags.map(tag => text(tag, 'Etiqueta', 255, true)))];
  if (body.description !== undefined) {
    const description = text(body.description, 'Descripción', 30000);
    product.descriptionHtml = description.split('\n').map(line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
  }
  if (body.categoryIds !== undefined) {
    if (!Array.isArray(body.categoryIds) || body.categoryIds.length > 100) throw new PosError('Categorías no válidas.');
    product.metafields = [{ namespace: 'custom', key: 'categorias', type: 'list.metaobject_reference', value: JSON.stringify([...new Set(body.categoryIds.map(id => gid(id, 'Metaobject')))]) }];
  }
  return product;
}

function normalizeProduct(product) {
  const { categoryMembership, ...rest } = product;
  return { ...rest, ...(categoryMembership ? { categoryIds: JSON.parse(categoryMembership.value || '[]') } : {}), ...(product.variants?.edges ? { variants: product.variants.edges.map(edge => edge.node) } : {}) };
}

export async function updateProduct(gql, id, body) {
  gid(id, 'Product');
  const product = { id, ...details(body) };
  const data = await gql(`mutation PosUpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { ${PRODUCT_FIELDS} } userErrors { field message } }
  }`, { product });
  return normalizeProduct(result(data.productUpdate, 'product'));
}

function price(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) throw new PosError('Introduce un precio válido, con un máximo de dos decimales.');
  return value;
}

function imageSource(value) {
  const url = text(value, 'URL de imagen', 2048, true);
  let parsed;
  try { parsed = new URL(url); } catch { throw new PosError('Introduce una URL HTTPS de imagen válida.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new PosError('Introduce una URL HTTPS de imagen válida.');
  return url;
}

let productStore;
function getProductStore() {
  productStore ||= createOperationStore(path.resolve(process.env.POS_DATA_DIR || '.pos-data', 'products'));
  return productStore;
}

export async function createProduct(gql, body, store = getProductStore()) {
  const input = details(body);
  const operationId = text(body.operationId, 'Operación', 36, true);
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(operationId)) throw new PosError('Identificador de creación no válido.');
  if (!Array.isArray(body.variants) || !body.variants.length || body.variants.length > 100) throw new PosError('Añade entre 1 y 100 variantes.');
  const names = body.variants.map(variant => text(variant?.name, 'Nombre de variante', 255, true));
  if (new Set(names.map(name => name.toLocaleLowerCase('es'))).size !== names.length) throw new PosError('Los nombres de las variantes deben ser distintos.');
  const optionName = text(body.optionName || 'Variante', 'Nombre de la opción', 255, true);
  input.productOptions = [{ name: optionName, values: names.map(name => ({ name })) }];
  input.variants = body.variants.map((variant, index) => ({
    price: price(variant.price), barcode: text(variant.barcode, 'Código de barras', 255),
    inventoryItem: { sku: text(variant.sku, 'SKU', 255), tracked: true },
    optionValues: [{ optionName, name: names[index] }],
  }));
  if (body.imageUrl) input.files = [{ originalSource: imageSource(body.imageUrl), contentType: 'IMAGE', alt: input.title }];
  const handle = `pos-${operationId.toLowerCase()}`;
  input.handle = handle;
  const fields = `${PRODUCT_FIELDS} totalInventory featuredImage { url altText } variants(first: 100) { edges { node { ${VARIANT_FIELDS} } } }`;
  return store.operation(operationId, 'product_create', input, async ({ step }) => step('create', async () => {
    const data = await gql(`mutation PosCreateProduct($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) { product { ${fields} } userErrors { field message } }
    }`, { input });
    return normalizeProduct(result(data.productSet, 'product'));
  }, async () => {
    const data = await gql(`query PosFindCreatedProduct($query: String!) { products(first: 1, query: $query) { nodes { ${fields} } } }`, { query: `handle:${handle}` });
    return data.products.nodes[0] ? normalizeProduct(data.products.nodes[0]) : null;
  }));
}

export async function addProductImage(gql, id, body) {
  gid(id, 'Product');
  const data = await gql(`mutation PosAddProductImage($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) { product { id } userErrors { field message } }
  }`, { product: { id }, media: [{ originalSource: imageSource(body?.url), mediaContentType: 'IMAGE', alt: text(body?.alt || '', 'Texto alternativo', 255) }] });
  return result(data.productUpdate, 'product');
}

export async function uploadProductImage(gql, id, bytes, mimeType, filename, upload = fetch) {
  gid(id, 'Product');
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 8 * 1024 * 1024) throw new PosError('Elige una imagen de hasta 8 MB.');
  const signatures = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!signatures[mimeType]) throw new PosError('Utiliza una imagen JPG, PNG o WebP válida.');
  const data = await gql(`mutation PosStageProductImage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
  }`, { input: [{ filename: text(filename, 'Nombre de archivo', 255, true), mimeType, resource: 'PRODUCT_IMAGE', httpMethod: 'POST', fileSize: String(bytes.length) }] });
  const targets = result(data.stagedUploadsCreate, 'stagedTargets');
  if (!targets[0]) throw new PosError('Shopify no ha preparado la subida de imagen.', 502);
  const target = targets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append('file', new Blob([bytes], { type: mimeType }), filename);
  const response = await upload(target.url, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new PosError('No se ha podido subir la imagen. Vuelve a intentarlo.', 502);
  return addProductImage(gql, id, { url: target.resourceUrl, alt: filename });
}

export async function updateVariant(gql, productId, variantId, body) {
  gid(productId, 'Product');
  gid(variantId, 'ProductVariant');
  price(body?.price);
  const variant = {
    id: variantId,
    price: body.price,
    barcode: text(body.barcode, 'Código de barras', 255),
    inventoryItem: { sku: text(body.sku, 'SKU', 255) },
  };
  // Shopify validates that the variant belongs to this product; no inventory
  // quantities or unrelated input fields are forwarded to the mutation.
  const data = await gql(`mutation PosUpdateProductVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
      productVariants { ${VARIANT_FIELDS} } userErrors { field message }
    }
  }`, { productId, variants: [variant] });
  const variants = result(data.productVariantsBulkUpdate, 'productVariants');
  const updated = variants.find(item => item.id === variantId);
  if (!updated) throw new PosError('Shopify no ha confirmado la variante. Actualiza el catálogo antes de reintentar.', 502);
  return updated;
}

export async function addVariant(gql, productId, body) {
  gid(productId, 'Product');
  const variant = { price: price(body?.price), barcode: text(body?.barcode, 'Código de barras', 255), inventoryItem: { sku: text(body?.sku, 'SKU', 255), tracked: true } };
  if (!Array.isArray(body?.options) || !body.options.length || body.options.length > 3) throw new PosError('Completa las opciones de la variante.');
  variant.optionValues = body.options.map(option => ({ optionName: text(option?.name, 'Opción', 255, true), name: text(option?.value, 'Valor', 255, true) }));
  const data = await gql(`mutation PosAddProductVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { ${VARIANT_FIELDS} } userErrors { field message } }
  }`, { productId, variants: [variant] });
  const variants = result(data.productVariantsBulkCreate, 'productVariants');
  if (!variants[0]) throw new PosError('Shopify no ha confirmado la variante.', 502);
  return variants[0];
}

export async function deleteVariant(gql, productId, variantId) {
  gid(productId, 'Product'); gid(variantId, 'ProductVariant');
  const data = await gql(`mutation PosDeleteProductVariant($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) { product { id totalInventory } userErrors { field message } }
  }`, { productId, variantsIds: [variantId] });
  return result(data.productVariantsBulkDelete, 'product');
}

const inventorySchemas = new WeakMap();
async function inventorySchema(gql) {
  if (!inventorySchemas.has(gql)) {
    const pending = gql(`query PosInventorySchema { __type(name: "InventoryQuantityInput") { inputFields { name } } }`)
      .then(data => data.__type.inputFields.some(field => field.name === 'changeFromQuantity'))
      .catch(error => { inventorySchemas.delete(gql); throw error; });
    inventorySchemas.set(gql, pending);
  }
  return inventorySchemas.get(gql);
}

export async function getVariantInventory(gql, productId, variantId) {
  gid(productId, 'Product'); gid(variantId, 'ProductVariant');
  const data = await gql(`query PosVariantInventory($id: ID!) {
    productVariant(id: $id) { id product { id totalInventory } inventoryQuantity inventoryItem { id tracked } }
  }`, { id: variantId });
  const variant = data.productVariant;
  if (!variant || variant.product.id !== productId) throw new PosError('Variante no encontrada.', 404);
  const levels = [], locations = [];
  for (const kind of ['levels', 'locations']) {
    let after = null;
    const seen = new Set();
    do {
      const page = kind === 'levels'
        ? (await gql(`query PosInventoryLevels($id: ID!, $after: String) { inventoryItem(id: $id) { inventoryLevels(first: 100, after: $after) { nodes { location { id name } quantities(names: ["available"]) { name quantity } } pageInfo { hasNextPage endCursor } } } }`, { id: variant.inventoryItem.id, after })).inventoryItem.inventoryLevels
        : (await gql(`query PosInventoryLocations($after: String) { locations(first: 100, after: $after) { nodes { id name isActive } pageInfo { hasNextPage endCursor } } }`, { after })).locations;
      (kind === 'levels' ? levels : locations).push(...page.nodes);
      if (!page.pageInfo.hasNextPage) break;
      after = page.pageInfo.endCursor;
      if (!after || seen.has(after)) throw new PosError('No se han podido cargar todas las ubicaciones.', 502);
      seen.add(after);
    } while (after);
  }
  return { inventoryItemId: variant.inventoryItem.id, tracked: variant.inventoryItem.tracked, totalInventory: variant.product.totalInventory, inventoryQuantity: variant.inventoryQuantity,
    locations: locations.filter(location => location.isActive).map(location => ({ id: location.id, name: location.name, quantity: levels.find(level => level.location.id === location.id)?.quantities.find(quantity => quantity.name === 'available')?.quantity ?? null })) };
}

export async function setVariantInventory(gql, productId, variantId, body) {
  const locationId = gid(body?.locationId, 'Location');
  const quantity = body?.quantity, previous = body?.previous;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000 || (previous !== null && (!Number.isInteger(previous) || Math.abs(previous) > 1000000))) throw new PosError('Introduce un stock entero entre 0 y 1.000.000.');
  const inventory = await getVariantInventory(gql, productId, variantId);
  if (!inventory.tracked) throw new PosError('Activa el seguimiento de inventario en Shopify antes de ajustar existencias.');
  const location = inventory.locations.find(location => location.id === locationId);
  if (!location) throw new PosError('Ubicación no disponible.');
  if (location.quantity !== previous) throw new PosError('El stock ha cambiado. Actualiza las existencias y vuelve a guardar.', 409);
  const modern = await inventorySchema(gql);
  const operationId = text(body.operationId, 'Operación de stock', 36, true);
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(operationId)) throw new PosError('Identificador de stock no válido.');
  const variables = { inventoryItemId: inventory.inventoryItemId, locationId, quantity, key: operationId };
  if (previous === null) {
    const data = await gql(`mutation PosActivateProductInventory($inventoryItemId: ID!, $locationId: ID!, $quantity: Int!${modern ? ', $key: String!' : ''}) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $quantity) ${modern ? '@idempotent(key: $key)' : ''} { inventoryLevel { id } userErrors { field message } }
    }`, variables);
    result(data.inventoryActivate, 'inventoryLevel');
  } else {
    const data = await gql(`mutation PosSetProductInventory($input: InventorySetQuantitiesInput!${modern ? ', $key: String!' : ''}) {
      inventorySetQuantities(input: $input) ${modern ? '@idempotent(key: $key)' : ''} { inventoryAdjustmentGroup { reason } userErrors { field message } }
    }`, { input: { name: 'available', reason: 'correction', ...(modern ? {} : { ignoreCompareQuantity: false }), quantities: [{ inventoryItemId: inventory.inventoryItemId, locationId, quantity, [modern ? 'changeFromQuantity' : 'compareQuantity']: previous }] }, key: operationId });
    result(data.inventorySetQuantities, 'inventoryAdjustmentGroup');
  }
  return getVariantInventory(gql, productId, variantId);
}

export async function enableInventoryTracking(gql, productId, variantId) {
  const inventory = await getVariantInventory(gql, productId, variantId);
  const data = await gql(`mutation PosEnableInventoryTracking($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) { inventoryItem { id tracked } userErrors { field message } }
  }`, { id: inventory.inventoryItemId, input: { tracked: true } });
  result(data.inventoryItemUpdate, 'inventoryItem');
  return getVariantInventory(gql, productId, variantId);
}
