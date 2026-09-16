import { PosError } from '../operationStore.js';
import { validEmail } from './service.js';
import { giftMessage } from './templates.js';

export async function queueGiftReceipt(gql, posStore, mail, { order, email } = {}) {
  email = typeof email === 'string' ? email.trim() : '';
  if (typeof order !== 'string' || !validEmail(email)) throw new PosError('Pedido o correo inválido');
  const sale = posStore.read().movements.find(m => m.type === 'sale' && m.shopifyOrderName === order);
  if (!sale) throw new PosError('Venta no encontrada', 404);
  const items = [];
  let after = null;
  let details;
  do {
    const data = await gql(`query PosGiftReceipt($id: ID!, $after: String) {
      order(id: $id) { id name createdAt lineItems(first: 100, after: $after) {
        nodes { title variantTitle quantity } pageInfo { hasNextPage endCursor }
      } }
    }`, { id: sale.shopifyOrderId, after });
    if (!data.order) throw new PosError('Pedido no encontrado en Shopify', 404);
    details = data.order;
    items.push(...details.lineItems.nodes);
    after = details.lineItems.pageInfo.hasNextPage ? details.lineItems.pageInfo.endCursor : null;
  } while (after);
  // Prices and payment data are deliberately never queried for this document.
  return mail.enqueue(`gift:${sale.shopifyOrderId}`, email, giftMessage(details, items));
}
