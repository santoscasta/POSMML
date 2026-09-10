import { PosError } from './operationStore.js';

export async function sendReceipt(gql, store, { order, email } = {}) {
  if (typeof order !== 'string' || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new PosError('Pedido o correo inválido');
  }
  const sale = store.read().movements.find(m => m.type === 'sale' && m.shopifyOrderName === order);
  if (!sale) throw new PosError('No se encuentra una venta completada para este pedido', 404);
  const data = await gql(`mutation PosReceipt($id: ID!, $email: EmailInput!) {
    orderInvoiceSend(id: $id, email: $email) { order { id } userErrors { message } }
  }`, { id: sale.shopifyOrderId, email: { to: email } });
  const result = data?.orderInvoiceSend;
  if (result?.userErrors?.length) throw new PosError(result.userErrors.map(e => e.message).join(', '));
  if (!result?.order?.id) throw new Error('Shopify no confirmó el envío');
  return { sent: true };
}
