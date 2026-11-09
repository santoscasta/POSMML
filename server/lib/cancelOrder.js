import { setTimeout as delay } from 'node:timers/promises';
import { PosError } from './operationStore.js';
import { cents } from './accounting.js';

// Read the remote state on each attempt: a lost response must not cancel the
// same preparation again or repeat a refund that has already been recorded.
export async function cancelOrder(gql, input, { wait = delay, attempts = 10 } = {}) {
  const { orderId, reason = 'OTHER', restock = true } = input;
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId)) throw new PosError('Pedido inválido');
  const { order } = await gql(`query OrderCancellationState($id: ID!) {
    order(id: $id) {
      cancelledAt tags
      totalReceivedSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      fulfillments(first: 250) {
        id status inTransitAt deliveredAt
        service { handle }
        trackingInfo { number url }
      }
    }
  }`, { id: orderId });
  if (!order) throw new PosError('Pedido no encontrado', 404);
  if (order.cancelledAt) return { success: true };
  if (cents(order.totalReceivedSet?.shopMoney?.amount) > cents(order.totalRefundedSet?.shopMoney?.amount)) {
    throw new PosError('Reembolsa primero el pedido desde «Reembolso» para registrar el método y la caja; después podrás cancelarlo.', 409);
  }
  if (!Array.isArray(order.fulfillments) || order.fulfillments.length >= 250) {
    throw new PosError('No se han podido comprobar todas las preparaciones. Revisa el pedido en Shopify.', 409);
  }
  const active = order.fulfillments.filter(fulfillment => !['CANCELLED', 'ERROR', 'FAILURE'].includes(fulfillment.status));
  // Validate every preparation before changing any of them. Carrier shipments
  // and external fulfillment services must be handled through Shopify.
  if (active.some(fulfillment => !order.tags?.includes('POS MML') || fulfillment.service?.handle !== 'manual' || !Array.isArray(fulfillment.trackingInfo) || fulfillment.trackingInfo.length || fulfillment.inTransitAt || fulfillment.deliveredAt)) {
    throw new PosError('El pedido tiene envíos o preparaciones externas activos. Anúlalos en Shopify antes de cancelar el pedido.', 409);
  }
  for (const fulfillment of active) {
    const data = await gql(`mutation CancelPosOrderFulfillment($id: ID!) {
      fulfillmentCancel(id: $id) {
        fulfillment { id status }
        userErrors { field message }
      }
    }`, { id: fulfillment.id });
    const result = data?.fulfillmentCancel;
    if (result?.userErrors?.length) {
      throw new PosError(`No se ha podido anular la preparación: ${result.userErrors.map(error => error.message).join(', ')}`, 409);
    }
    if (result?.fulfillment?.id !== fulfillment.id || result.fulfillment.status !== 'CANCELLED') {
      throw new PosError('No se ha confirmado la anulación de la preparación. Reintenta la cancelación para comprobar su estado.', 409);
    }
  }
  const data = await gql(`mutation CancelPosOrder($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!) {
    orderCancel(orderId: $orderId, reason: $reason, refund: false, restock: $restock, notifyCustomer: false) {
      job { id done }
      orderCancelUserErrors { field message }
    }
  }`, { orderId, reason, restock });
  const result = data?.orderCancel;
  if (result?.orderCancelUserErrors?.length) throw new PosError(result.orderCancelUserErrors.map(error => error.message).join(', '));
  if (!result?.job?.id) throw new PosError('Shopify no ha confirmado la solicitud de cancelación. Actualiza el pedido antes de reintentar.', 409);
  // Shopify cancels asynchronously. Do not close the dialog as successful until
  // the order itself confirms cancellation, even if the job reports done.
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await wait(500);
    const current = await gql(`query OrderCancellationStatus($id: ID!) { order(id: $id) { cancelledAt } }`, { id: orderId });
    if (current.order?.cancelledAt) return { success: true };
  }
  throw new PosError('Shopify sigue procesando la cancelación. Espera unos segundos y actualiza el pedido antes de reintentar.', 409);
}
