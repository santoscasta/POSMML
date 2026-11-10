import { PosError } from './operationStore.js';
import { logEvent } from './diagnostics.js';

export function assertRestockableItems(items, { allowSkip = true } = {}) {
  const blocked = items.filter(item => !/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(item.inventoryItemId || ''));
  if (!blocked.length) return;
  logEvent('inventory.restock_blocked', { errorCode: 'RESTOCK_UNAVAILABLE', count: blocked.length }, 'warn');
  const next = allowSkip ? 'Revisa el artículo en Shopify o desmarca «Reponer» y gestiona su stock por separado.' : 'Revisa estos artículos en Shopify o cancela allí sin reposición si corresponde.';
  throw new PosError(`No se puede reponer: ${blocked.map(item => item.title).join(', ')}. Falta una variante vinculada con control de inventario. ${next}`, 409, 'RESTOCK_UNAVAILABLE');
}

// Read every page: an incomplete order must never turn into a partial restock.
export async function assertOrderRestockable(gql, orderId, selectedLines) {
  const lines = [];
  const cursors = new Set();
  let after = null;
  do {
    const data = await gql(`query RestockOrderLines($id: ID!, $after: String) {
      order(id: $id) { lineItems(first: 100, after: $after) {
        nodes { id title currentQuantity variant { inventoryItem { id tracked } } }
        pageInfo { hasNextPage endCursor }
      } }
    }`, { id: orderId, after });
    const page = data.order?.lineItems;
    if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== 'boolean' || (page.pageInfo.hasNextPage && (!page.pageInfo.endCursor || cursors.has(page.pageInfo.endCursor)))) {
      throw new PosError('No se han podido comprobar todos los artículos para reponer. Actualiza el pedido y reintenta.', 409, 'RESTOCK_UNAVAILABLE');
    }
    lines.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (after) cursors.add(after);
  } while (after);
  const selected = selectedLines ? selectedLines.map(selection => {
    const line = lines.find(item => item.id === selection.lineItemId);
    if (!line) throw new PosError('Un artículo de devolución ya no está disponible. Actualiza el pedido.', 409, 'RESTOCK_UNAVAILABLE');
    return line;
  }) : lines.filter(line => line.currentQuantity > 0);
  assertRestockableItems(selected.map(line => ({ title: line.title, inventoryItemId: line.variant?.inventoryItem?.tracked ? line.variant.inventoryItem.id : null })), { allowSkip: !!selectedLines });
}

export async function verifyRefundRestock(gql, refundId, expectedLines) {
  const data = await gql(`query PosRefundRestockStatus($id: ID!) {
    refund(id: $id) { refundLineItems(first: 100) {
      nodes { quantity restocked restockType lineItem { id } location { id } }
      pageInfo { hasNextPage }
    } }
  }`, { id: refundId });
  const page = data.refund?.refundLineItems;
  const confirmed = Array.isArray(page?.nodes) && page?.pageInfo?.hasNextPage === false && expectedLines?.length > 0 && expectedLines.every(expected =>
    page.nodes.filter(line => line.lineItem.id === expected.lineItemId && line.restocked === true && line.restockType === expected.restockType && line.location?.id === expected.locationId)
      .reduce((sum, line) => sum + line.quantity, 0) === expected.quantity);
  if (confirmed) return;
  logEvent('inventory.restock_unconfirmed', { errorCode: 'RECONCILIATION_REQUIRED' }, 'warn');
  throw new PosError('El reembolso ya está registrado, pero Shopify no confirma la reposición de todos los artículos. Revisa el inventario y reanuda la devolución. No repitas el reembolso ni sumes stock sin comprobarlo.', 409, 'RECONCILIATION_REQUIRED');
}

export function getRestockAlerts(state) {
  return Object.values(state.operations || {}).filter(op => op.kind === 'exchange' && op.result && op.input?.restock && op.quote?.accountingVersion === 2)
    .flatMap(op => {
      const missing = op.quote.returnedItems.filter(item => !item.inventoryItemId);
      if (!missing.length && op.steps?.['exchange-restock']?.status === 'done') return [];
      return [{ operationId: op.key, orderId: op.input.orderId, orderName: op.quote.orderName, createdAt: op.createdAt,
        items: (missing.length ? missing : op.quote.returnedItems).map(item => ({ title: item.title, quantity: item.quantity })) }];
    });
}
