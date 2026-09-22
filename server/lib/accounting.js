import { PosError } from './operationStore.js';

export function cents(value) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number) || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) {
    throw new PosError('Importe inválido (máximo dos decimales)');
  }
  if (!Number.isSafeInteger(Math.round(number * 100))) throw new PosError('Importe fuera de rango');
  return Math.round(number * 100);
}

export function paymentSplits(payment, allowExchange = false) {
  const methods = ['CASH', 'CARD', 'BIZUM', 'VOUCHER'];
  if (allowExchange) methods.push('EXCHANGE');
  const amount = cents(payment.amount);
  const splits = payment.method === 'MIXED' ? payment.mixedPayments : [{ method: payment.method, amount: payment.amount, voucherCode: payment.voucherCode }];
  if (!Array.isArray(splits) || !splits.length) throw new PosError('Falta el desglose del pago mixto');
  let sum = 0;
  for (const split of splits) {
    if (!methods.includes(split.method)) throw new PosError('Método de pago inválido');
    const value = cents(split.amount);
    if (payment.method === 'MIXED' && value <= 0) throw new PosError('Cada parte del pago debe ser mayor que cero');
    if (split.method === 'VOUCHER' && !split.voucherCode?.trim()) throw new PosError('Falta el código del vale');
    sum += value;
  }
  if (sum !== amount) throw new PosError('El desglose no coincide con el total');
  if (payment.method === 'CASH' && cents(payment.cashReceived) < amount) throw new PosError('Efectivo insuficiente');
  return splits.map(s => ({ ...s, amount: cents(s.amount) / 100 }));
}

export function computeKPIs(movements, openingAmount = 0) {
  const totals = { CASH: 0, CARD: 0, BIZUM: 0, VOUCHER: 0, EXCHANGE: 0 };
  let gross = 0, refunds = 0, refundsCash = 0, totalOrders = 0;
  for (const movement of movements) {
    if (movement.accountingError) throw new PosError(movement.accountingError, 409, 'LEGACY_RECONCILIATION_REQUIRED');
    const amount = cents(movement.amount);
    if (movement.type === 'refund') {
      refunds += amount;
      if (movement.method === 'CASH') refundsCash += amount;
    } else {
      totalOrders++;
      gross += amount;
      const splits = movement.method === 'MIXED' ? movement.mixedPayments : [{ method: movement.method, amount: movement.amount }];
      if (!splits?.length || splits.reduce((sum, s) => sum + cents(s.amount), 0) !== amount) {
        throw new PosError(`Falta el desglose del pedido ${movement.shopifyOrderName}. Revisa ese movimiento antes de cerrar caja.`, 409, 'LEGACY_RECONCILIATION_REQUIRED');
      }
      for (const split of splits) {
        if (!(split.method in totals)) throw new PosError('Método desconocido en el historial');
        totals[split.method] += cents(split.amount);
      }
    }
  }
  return {
    totalOrders, grossSales: gross / 100, refunds: refunds / 100,
    cashSales: totals.CASH / 100, cardSales: totals.CARD / 100,
    bizumSales: totals.BIZUM / 100, voucherSales: totals.VOUCHER / 100,
    ...(totals.EXCHANGE ? { exchangeSales: totals.EXCHANGE / 100 } : {}),
    refundsCash: refundsCash / 100,
    expectedCash: (cents(openingAmount || 0) + totals.CASH - refundsCash) / 100,
  };
}

export async function getPayments(gql, store, { sessionId, orderId, diagnostics } = {}) {
  const local = store.read().movements;
  const managedSales = new Set(local.filter(p => p.type === 'sale').map(p => p.shopifyOrderId));
  const legacy = [];
  let after = null;
  do {
    const data = await gql(`query PosPaymentHistory($after: String) {
      orders(first: 100, after: $after, query: "tag:'POS MML'", sortKey: CREATED_AT, reverse: true) {
        nodes { id name createdAt displayFinancialStatus totalPriceSet { shopMoney { amount } }
          metafields(first: 50, namespace: "pos_mml") { nodes { key value } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    for (const order of data.orders.nodes) {
      if (managedSales.has(order.id)) continue;
      const mf = Object.fromEntries(order.metafields.nodes.map(f => [f.key, f.value]));
      if (!mf.payment_method || !mf.session_id) diagnostics?.push({
        id: order.id, name: order.name, createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus,
        reason: !mf.payment_method ? 'missing_payment' : 'missing_session',
      });
      if (!mf.payment_method) continue;
      let mixedPayments;
      try { mixedPayments = mf.mixed_payments ? JSON.parse(mf.mixed_payments) : undefined; } catch { /* reported by KPIs */ }
      legacy.push({
        id: `legacy-${order.id}`, shopifyOrderId: order.id, shopifyOrderName: order.name,
        amount: Number(order.totalPriceSet.shopMoney.amount), method: mf.payment_method,
        type: mf.payment_type || 'sale', sessionId: mf.session_id,
        createdAt: order.createdAt, cashReceived: Number(mf.cash_received || 0),
        changeGiven: Number(mf.change_given || 0), voucherCode: mf.voucher_code || null,
        mixedPayments,
        // The old implementation erased the original sale/session and refund
        // amount. Do not fabricate an accurate closing balance from those fields.
        ...(mf.payment_type === 'refund' ? { accountingError: `El pedido antiguo ${order.name} tiene la venta sobrescrita por una devolución. Requiere conciliación del historial.` } : {}),
      });
    }
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after);
  return [...legacy, ...local]
    .filter(p => (!sessionId || p.sessionId === sessionId) && (!orderId || p.shopifyOrderId === orderId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
