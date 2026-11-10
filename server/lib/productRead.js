import { PosError } from './operationStore.js';

function productId(id) {
  if (typeof id !== 'string' || !/^gid:\/\/shopify\/Product\/\d+$/.test(id)) throw new PosError('Identificador de producto no válido.');
}

function cursor(page, seen = new Set()) {
  if (!page.pageInfo.hasNextPage) return null;
  const after = page.pageInfo.endCursor;
  if (!after || seen.has(after)) throw new PosError('No se ha podido completar la consulta. Vuelve a intentarlo.', 502);
  seen.add(after);
  return after;
}

const variantFields = `id title price sku barcode inventoryQuantity selectedOptions { name value } image { url altText } inventoryItem { inventoryHistoryUrl }`;
const imageFields = 'id url altText';

export async function readProduct(gql, id) {
  productId(id);
  const data = await gql(`query PosReadProduct($id: ID!) {
    shop { myshopifyDomain }
    product(id: $id) {
      id title description vendor productType tags status totalInventory createdAt updatedAt onlineStoreUrl
      featuredImage { url altText }
      categoryMembership: metafield(namespace: "custom", key: "categorias") {
        value references(first: 100) { nodes { ... on Metaobject { id displayName } } }
      }
      images(first: 100) { nodes { ${imageFields} } pageInfo { hasNextPage endCursor } }
      variants(first: 100) { nodes { ${variantFields} } pageInfo { hasNextPage endCursor } }
    }
  }`, { id });
  if (!data.product) throw new PosError('El producto ya no está disponible.', 404);
  const product = data.product;
  for (const field of ['variants', 'images']) {
    let page = product[field];
    const nodes = [...page.nodes], seen = new Set();
    let after;
    while ((after = cursor(page, seen))) {
      const next = await gql(field === 'variants'
        ? `query PosReadProductVariants($id: ID!, $after: String) { product(id: $id) { variants(first: 100, after: $after) { nodes { ${variantFields} } pageInfo { hasNextPage endCursor } } } }`
        : `query PosReadProductImages($id: ID!, $after: String) { product(id: $id) { images(first: 100, after: $after) { nodes { ${imageFields} } pageInfo { hasNextPage endCursor } } } }`, { id, after });
      if (!next.product) throw new PosError('El producto ya no está disponible.', 404);
      page = next.product[field]; nodes.push(...page.nodes);
    }
    product[field] = [...new Map(nodes.map(node => [node.id, node])).values()];
  }
  const categories = product.categoryMembership?.references?.nodes || [];
  const categoryIds = categories.map(category => category.id);
  const domain = data.shop.myshopifyDomain;
  return { ...product, categoryMembership: undefined, categoryIds, categories,
    adminUrl: /^[a-z0-9-]+\.myshopify\.com$/i.test(domain) ? `https://admin.shopify.com/store/${domain.replace(/\.myshopify\.com$/i, '')}/products/${id.split('/').at(-1)}` : null };
}

// Shopify returns formatted messages. Send text to the UI, with no HTML to execute.
function messageText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, key) => {
      if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? match;
      const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }).replace(/\s+/g, ' ').trim();
}

export async function readProductHistory(gql, id, after = null) {
  productId(id);
  if (after !== null && (typeof after !== 'string' || !after || after.length > 2048 || /[\x00-\x1f]/.test(after))) throw new PosError('Página de historial no válida.');
  const data = await gql(`query PosReadProductHistory($id: ID!, $after: String) {
    product(id: $id) { events(first: 30, after: $after, reverse: true) {
      nodes { id createdAt message appTitle attributeToUser ... on BasicEvent { action author } }
      pageInfo { hasNextPage endCursor }
    } }
  }`, { id, after });
  if (!data.product) throw new PosError('El producto ya no está disponible.', 404);
  const page = data.product.events;
  const next = cursor(page, new Set(after ? [after] : []));
  return { events: page.nodes.map(event => ({ id: event.id, createdAt: event.createdAt, message: messageText(event.message),
    action: event.action || 'activity', author: event.author || null, appTitle: event.appTitle || null })), nextCursor: next };
}
