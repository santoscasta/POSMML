import { PosError } from './operationStore.js';
import { currentSession } from './posService.js';
import { cents, paymentSplits } from './accounting.js';

// Record a payment already collected, without issuing/debiting a voucher or
// executing any Shopify payment mutation. The operator supplies the receipt.
export async function reconcileSale(gql, store, { sessionId, orderId, payment } = {}) {
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId || '') || !payment) throw new PosError('Pedido y pago requeridos');
  const splits = paymentSplits(payment);
  return store.exclusive(async () => {
    const state = store.read();
    if (state.movements.some(p => p.type === 'sale' && p.shopifyOrderId === orderId)) throw new PosError('Este pedido ya tiene un cobro registrado', 409);
    const open = await currentSession(gql);
    if (open.id !== sessionId) throw new PosError('La sesión seleccionada ya no está abierta', 409);
    if (Object.values(state.operations).some(op => !op.result && (
      op.input?.orderId === orderId || op.steps?.['draft-complete']?.value?.order?.id === orderId ||
      Object.values(op.children || {}).some(child => child.steps?.['draft-complete']?.value?.order?.id === orderId)
    ))) throw new PosError('Reanuda la operación pendiente de este pedido antes de conciliarlo', 409);
    const data = await gql(`query PosReconcileOrder($id: ID!) {
      order(id: $id) { id name createdAt tags cancelledAt displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        metafields(first: 50, namespace: "pos_mml") { nodes { key value } }
      }
    }`, { id: orderId });
    const order = data.order;
    if (!order || !order.tags.includes('POS MML') || order.cancelledAt || order.displayFinancialStatus !== 'PAID') throw new PosError('Solo se pueden conciliar pedidos POS pagados sin devoluciones ni cancelaciones');
    const mf = Object.fromEntries(order.metafields.nodes.map(f => [f.key, f.value]));
    if (mf.payment_method && mf.session_id) throw new PosError('El pedido ya tiene un registro de caja', 409);
    if (mf.session_id && mf.session_id !== sessionId) throw new PosError('El pedido pertenece a otra sesión', 409);
    if (mf.payment_type && mf.payment_type !== 'sale') throw new PosError('El historial de este pedido requiere revisión de sus devoluciones', 409);
    if (order.totalPriceSet.shopMoney.currencyCode !== 'EUR' || cents(order.totalPriceSet.shopMoney.amount) !== cents(payment.amount)) throw new PosError('El desglose debe coincidir con el total de la compra');
    // Existing tender metadata must not be overwritten by a guess.
    if (mf.payment_method && mf.payment_method !== payment.method) throw new PosError('El método no coincide con el registro existente');
    if (mf.payment_method === 'MIXED') {
      let previous;
      try { previous = JSON.parse(mf.mixed_payments); } catch { throw new PosError('Falta un desglose verificable en el historial', 409); }
      if (JSON.stringify(previous) !== JSON.stringify(splits)) throw new PosError('El desglose no coincide con el registro existente');
    }
    const entry = { id: `reconciled-${orderId}`, shopifyOrderId: orderId, shopifyOrderName: order.name,
      sessionId, type: 'sale', method: payment.method, amount: cents(payment.amount) / 100,
      ...(payment.method === 'MIXED' ? { mixedPayments: splits } : {}), voucherCode: payment.voucherCode || null,
      createdAt: order.createdAt, reconciledAt: new Date().toISOString(), notes: 'Pago ya cobrado, conciliado según ticket' };
    state.movements.push(entry);
    store.write(state);
    return entry;
  });
}
