import { createHash } from 'node:crypto';
import { PosError } from './operationStore.js';
import { cents } from './accounting.js';
import { issueVoucher } from './voucherIssue.js';

export function orderVoucherKey({ orderId, lineItemId, unit }) {
  return `order-gift-${createHash('sha256').update(JSON.stringify([orderId, lineItemId, unit])).digest('hex')}`;
}

export async function issueOrderGiftVoucher(gql, store, request, fields) {
  const { orderId, lineItemId, unit } = request;
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId) || !/^gid:\/\/shopify\/LineItem\/\d+$/.test(lineItemId) || !Number.isSafeInteger(unit) || unit < 1) throw new PosError('Tarjeta regalo inválida');
  const input = { orderId, lineItemId, unit };
  return issueVoucher(gql, store, orderVoucherKey(input), input, fields, {
    kind: 'order_voucher',
    prepare: async () => {
      let after = null;
      const cursors = new Set();
      do {
        const { order } = await gql(`query OrderGiftVoucher($id: ID!, $after: String) {
          order(id: $id) {
            name cancelledAt displayFinancialStatus
            totalRefundedSet { shopMoney { amount } }
            customer { id firstName lastName email }
            lineItems(first: 100, after: $after) {
              nodes { id title isGiftCard quantity currentQuantity originalUnitPriceSet { shopMoney { amount currencyCode } } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`, { id: orderId, after });
        if (!order) throw new PosError('Pedido no encontrado', 404);
        if (order.cancelledAt || order.displayFinancialStatus !== 'PAID' || cents(order.totalRefundedSet.shopMoney.amount) > 0) throw new PosError('Solo puedes generar el vale de un pedido pagado y sin reembolsos', 409);
        const item = order.lineItems.nodes.find(line => line.id === lineItemId);
        if (item) {
          if (item.isGiftCard || item.title.trim().replace(/\s+/g, ' ').toUpperCase() !== 'TARJETA REGALO') throw new PosError('El artículo no es el producto TARJETA REGALO del TPV');
          if (unit > Math.min(item.quantity, item.currentQuantity)) throw new PosError('La unidad no está disponible');
          const exchanged = store.read().movements.some(movement => movement.originalOrderId === orderId && movement.exchangeReceipt?.returnedItems?.some(line => line.lineItemId === lineItemId));
          if (exchanged) throw new PosError('Esta tarjeta regalo ya se ha cambiado', 409);
          const money = item.originalUnitPriceSet.shopMoney;
          if (money.currencyCode !== 'EUR' || cents(money.amount) <= 0) throw new PosError('La tarjeta regalo debe tener un importe positivo en euros');
          return {
            amount: cents(money.amount) / 100, originOrderId: orderId,
            ...(order.customer ? { customerId: order.customer.id, customerName: `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim(), customerEmail: order.customer.email } : {}),
            notes: `Tarjeta regalo del pedido ${order.name}. Artículo ${lineItemId}, unidad ${unit}.`,
          };
        }
        if (!order.lineItems.pageInfo.hasNextPage) break;
        after = order.lineItems.pageInfo.endCursor;
        if (!after || cursors.has(after)) throw new PosError('No se han podido comprobar los artículos del pedido');
        cursors.add(after);
      } while (after);
      throw new PosError('La tarjeta regalo no pertenece al pedido', 404);
    },
  });
}

export async function orderGiftVouchers(gql, store, orderId, fields) {
  const operations = Object.values(store.read().operations).filter(op => op.kind === 'order_voucher' && op.input.orderId === orderId && op.result);
  return Promise.all(operations.map(async op => {
    const { giftCard } = await gql(`query OrderGiftVoucherStatus($id: ID!) { giftCard(id: $id) { ${fields} } }`, { id: op.result.card.id });
    if (!giftCard) throw new PosError('No se ha podido recuperar el vale del pedido', 409);
    return { lineItemId: op.input.lineItemId, unit: op.input.unit, card: giftCard, fullCode: op.result.fullCode };
  }));
}

export async function assertGiftVouchersCancelled(gql, store, orderId, lineItemIds) {
  if (!store) return;
  const issued = Object.values(store.read().operations).filter(op => op.kind === 'order_voucher' && op.input.orderId === orderId && op.result && (!lineItemIds?.length || lineItemIds.includes(op.input.lineItemId)));
  for (const op of issued) {
    const { giftCard } = await gql(`query RefundOrderGiftVoucher($id: ID!) { giftCard(id: $id) { enabled } }`, { id: op.result.card.id });
    if (!giftCard || giftCard.enabled) throw new PosError('Cancela primero el vale de esta tarjeta regalo desde Vales antes de devolverla o cambiarla', 409);
  }
}
