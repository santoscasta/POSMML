import { createHash } from 'node:crypto';
import { cents } from './accounting.js';
import { PosError } from './operationStore.js';
import { createPosService, currentSession } from './posService.js';
import { issueVoucher } from './voucherIssue.js';
import { resolveRefundCustomer } from './refundCustomer.js';

export async function quoteExchange(gql, input) {
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(input.orderId)) throw new PosError('Pedido inválido');
  const returns = input.refundLineItems;
  const items = input.items;
  const valid = (rows, field, resource) => Array.isArray(rows) && rows.length > 0 && rows.length <= 100 && new Set(rows.map(r => r[field])).size === rows.length && rows.every(r => new RegExp(`^gid://shopify/${resource}/\\d+$`).test(r[field]) && Number.isInteger(r.quantity) && r.quantity > 0);
  if (!valid(returns, 'lineItemId', 'LineItem') || !valid(items, 'variantId', 'ProductVariant')) throw new PosError('Selecciona artículos para devolver y para entregar');
  if (input.restock && !/^gid:\/\/shopify\/Location\/\d+$/.test(input.locationId || '')) throw new PosError('Selecciona la ubicación de reposición');
  const data = await gql(`query ExchangeQuote($id: ID!, $lines: [RefundLineItemInput!]!, $variants: [ID!]!) {
    order(id: $id) { id name cancelledAt customer { id firstName lastName email phone }
      transactions(first: 100) { kind status gateway }
      suggestedRefund(refundLineItems: $lines, refundShipping: false) { amountSet { shopMoney { amount currencyCode } }
        refundLineItems { quantity subtotalSet { shopMoney { amount currencyCode } } totalTaxSet { shopMoney { amount currencyCode } } lineItem { id title refundableQuantity variant { title } } } }
    }
    nodes(ids: $variants) { ... on ProductVariant { id title price inventoryQuantity inventoryPolicy product { title status } } }
  }`, { id: input.orderId, lines: returns.map(r => ({ ...r, restockType: 'NO_RESTOCK' })), variants: items.map(i => i.variantId) });
  const order = data.order;
  if (!order || order.cancelledAt) throw new PosError('Pedido no disponible para cambios');
  if (order.transactions.find(t => ['SALE', 'CAPTURE'].includes(t.kind) && t.status === 'SUCCESS')?.gateway !== 'manual') throw new PosError('Este pedido requiere gestionar el cambio desde Shopify: no tiene un pago manual compatible');
  const suggestion = order.suggestedRefund;
  if (!suggestion || suggestion.amountSet.shopMoney.currencyCode !== 'EUR') throw new PosError('No se ha podido calcular la devolución en euros');
  for (const r of returns) {
    const line = suggestion.refundLineItems.find(l => l.lineItem.id === r.lineItemId);
    if (!line || line.quantity !== r.quantity || line.lineItem.refundableQuantity < r.quantity) throw new PosError('Hay artículos que ya se han devuelto o una cantidad no válida');
  }
  const credit = cents(suggestion.amountSet.shopMoney.amount);
  if (credit <= 0) throw new PosError('Los artículos seleccionados no tienen importe disponible para el cambio');
  const cartItems = items.map(item => {
    const variant = data.nodes.find(v => v?.id === item.variantId);
    if (!variant || variant.product.status !== 'ACTIVE') throw new PosError('Un artículo de entrega ya no está disponible');
    if (variant.inventoryPolicy === 'DENY' && variant.inventoryQuantity < item.quantity) throw new PosError(`Stock insuficiente: ${variant.product.title}`);
    return { variantId: variant.id, quantity: item.quantity, price: cents(variant.price) / 100, title: variant.product.title, variantTitle: variant.title };
  });
  const returnedItems = suggestion.refundLineItems.map(item => ({
    lineItemId: item.lineItem.id, title: item.lineItem.title,
    variantTitle: item.lineItem.variant?.title || '', quantity: item.quantity,
    amount: (cents(item.subtotalSet.shopMoney.amount) + cents(item.totalTaxSet?.shopMoney?.amount || 0)) / 100,
  }));
  const calculated = await gql(`mutation ExchangeCalculate($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) { calculatedDraftOrder { totalPriceSet { shopMoney { amount currencyCode } } } userErrors { message } }
  }`, { input: { ...(order.customer ? { customerId: order.customer.id } : {}), lineItems: cartItems.map(i => ({ variantId: i.variantId, quantity: i.quantity, priceOverride: { amount: i.price.toFixed(2), currencyCode: 'EUR' } })) } });
  const calc = calculated.draftOrderCalculate;
  if (calc.userErrors?.length || !calc.calculatedDraftOrder) throw new PosError(calc.userErrors?.map(e => e.message).join(', ') || 'No se ha podido calcular el cambio');
  const money = calc.calculatedDraftOrder.totalPriceSet.shopMoney;
  if (money.currencyCode !== 'EUR') throw new PosError('Moneda no compatible');
  const total = cents(money.amount);
  if (total <= 0) throw new PosError('Los artículos de entrega deben tener un importe mayor que cero');
  const quote = { orderName: order.name, customer: order.customer, returnedItems, items: cartItems, credit: credit / 100, total: total / 100, due: Math.max(0, total - credit) / 100, voucher: Math.max(0, credit - total) / 100 };
  const token = createHash('sha256').update(JSON.stringify({ input: { orderId: input.orderId, returns, items, restock: !!input.restock, locationId: input.locationId || '' }, quote })).digest('hex');
  return { ...quote, token };
}

// Child operations share one lock and journal. Each mutation still records its
// own intent/result through the parent step runner for safe crash recovery.
function childStore(ctx) {
  return { operation: async (key, kind, input, work) => {
    ctx.op.children ||= {};
    const child = ctx.op.children[key] ||= { key, kind, input, steps: {}, sessionId: ctx.op.sessionId };
    ctx.save();
    if (child.result) return child.result;
    const step = async (name, action, reconcile) => {
      const value = await ctx.step(`${key}:${name}`, action, reconcile);
      child.steps[name] = { status: 'done', value };
      ctx.save();
      return value;
    };
    child.result = await work({ ...ctx, op: child, step });
    ctx.save();
    return child.result;
  } };
}

export async function exchangeItems(gql, store, operationId, input) {
  return store.operation(operationId, 'exchange', input, async ctx => {
    if (!ctx.op.quote) {
      const quote = await quoteExchange(gql, input);
      if (quote.token !== input.quoteToken) throw new PosError('El importe o el stock ha cambiado. Calcula de nuevo el cambio');
      if (quote.due > 0 && !['CASH', 'CARD', 'BIZUM'].includes(input.method)) throw new PosError('Selecciona cómo cobrar la diferencia');
      if (quote.due > 0 && input.method === 'CASH' && cents(input.cashReceived) < cents(quote.due)) throw new PosError('Efectivo insuficiente');
      const session = await currentSession(gql);
      ctx.op.sessionId = session.id;
      ctx.state.sessionDates[session.id] ||= session.updatedAt;
      ctx.op.quote = quote;
      ctx.save();
    }
    const q = ctx.op.quote;
    if (q.voucher > 0 && !ctx.op.exchangeCustomer) {
      const selected = input.customerId || input.newCustomer
        ? await resolveRefundCustomer(gql, ctx, input)
        : q.customer;
      if (!selected) throw new PosError('Selecciona o registra el cliente al que se asociará el vale');
      ctx.op.exchangeCustomer = selected;
      q.customer = selected;
      ctx.save();
    }
    const nested = childStore(ctx);
    const service = createPosService(gql, nested, { exchange: true });
    const returned = await service.refund(`${operationId}-return`, {
      orderId: input.orderId, amount: q.credit, method: 'EXCHANGE', refundLineItems: input.refundLineItems,
      restock: !!input.restock, locationId: input.locationId, note: `Cambio POS ${operationId}. Importe aplicado a nuevos artículos.`,
    });
    const usedCredit = Math.min(q.credit, q.total);
    const payment = q.due > 0 ? { method: 'MIXED', amount: q.total, mixedPayments: [{ method: 'EXCHANGE', amount: usedCredit }, { method: input.method, amount: q.due }] } : { method: 'EXCHANGE', amount: q.total };
    const sale = await service.checkout(`${operationId}-sale`, { cart: { items: q.items, customer: q.customer, note: `Cambio del pedido ${q.orderName}. POS ${operationId}. Crédito aplicado: ${usedCredit.toFixed(2)} EUR.` }, payment });
    const related = ctx.state.movements.filter(m => m.id === `${operationId}-return` || m.id === `${operationId}-sale`);
    for (const m of related) { m.originalOrderName = q.orderName; m.replacementOrderName = sale.name; m.exchangeId = operationId; m.originalOrderId = input.orderId; m.replacementOrderId = sale.shopifyOrderId; }
    if (q.due > 0 && input.method === 'CASH') {
      const paid = related.find(m => m.type === 'sale');
      paid.cashReceived = cents(input.cashReceived) / 100;
      paid.changeGiven = (cents(input.cashReceived) - cents(q.due)) / 100;
    }
    ctx.save();
    let voucher;
    if (q.voucher > 0) {
      const issued = await issueVoucher(gql, nested, `${operationId}-voucher`, { amount: q.voucher, customerId: q.customer?.id, customerName: q.customer ? `${q.customer.firstName || ''} ${q.customer.lastName || ''}`.trim() : undefined, customerEmail: q.customer?.email, notes: `Diferencia del cambio ${q.orderName} por ${sale.name}. POS ${operationId}` }, 'id lastCharacters note initialValue { amount }');
      voucher = { id: issued.card.id, code: issued.fullCode, amount: q.voucher };
    }
    const receipt = {
      originalOrderName: q.orderName, replacementOrderName: sale.name,
      createdAt: new Date().toISOString(), customer: q.customer,
      returnedItems: q.returnedItems,
      replacementItems: q.items,
      credit: q.credit, total: q.total, due: q.due,
      change: input.method === 'CASH' && q.due > 0 ? (cents(input.cashReceived) - cents(q.due)) / 100 : 0,
      ...(q.due > 0 ? { paymentMethod: input.method } : {}),
      ...(input.method === 'CASH' && q.due > 0 ? { cashReceived: cents(input.cashReceived) / 100 } : {}),
      ...(voucher ? { voucher: { code: voucher.code, amount: voucher.amount } } : {}),
    };
    for (const movement of related) movement.exchangeReceipt = receipt;
    ctx.save();
    return { success: true, name: sale.name, orderId: sale.shopifyOrderId, refundId: returned.refundId, due: q.due, credit: q.credit, total: q.total, change: receipt.change, receipt, ...(voucher ? { voucher, voucherCode: voucher.code } : {}) };
  });
}

export async function getExchangeReceipt(gql, store, exchangeId) {
  if (typeof exchangeId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(exchangeId)) throw new PosError('Cambio inválido');
  return store.exclusive(async () => {
    const state = store.read();
    const related = state.movements.filter(m => m.exchangeId === exchangeId);
    const existing = related.find(m => m.exchangeReceipt)?.exchangeReceipt;
    if (existing) return existing;
    const op = state.operations[exchangeId];
    if (!op?.result || op.kind !== 'exchange' || !op.quote) throw new PosError('No se han encontrado los datos del cambio', 404);
    const q = op.quote;
    let returnedItems = q.returnedItems;
    if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
      const data = await gql(`query ExchangeReceiptRecovery($id: ID!) {
        order(id: $id) { refunds { id createdAt refundLineItems(first: 100) { edges { node {
          quantity subtotalSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } }
          lineItem { id title variant { title } }
        } } } } }
      }`, { id: op.input.orderId });
      const refund = data.order?.refunds?.find(r => r.id === op.result.refundId);
      if (!refund) throw new PosError('No se ha podido reconstruir el ticket del cambio');
      returnedItems = refund.refundLineItems.edges.map(({ node: item }) => ({
        lineItemId: item.lineItem.id,
        title: item.lineItem.title,
        variantTitle: item.lineItem.variant?.title || '',
        quantity: item.quantity,
        amount: (cents(item.subtotalSet.shopMoney.amount) + cents(item.totalTaxSet?.shopMoney?.amount || 0)) / 100,
      }));
    }
    const customer = op.exchangeCustomer || q.customer || op.result.customer;
    const receipt = {
      originalOrderName: q.orderName || related[0]?.originalOrderName,
      replacementOrderName: op.result.name || related[0]?.replacementOrderName,
      createdAt: related[0]?.createdAt || op.createdAt,
      customer,
      returnedItems,
      replacementItems: q.items,
      credit: q.credit,
      total: q.total,
      due: q.due,
      change: op.result.change || 0,
      ...(q.due > 0 ? { paymentMethod: op.input.method } : {}),
      ...(op.input.method === 'CASH' && q.due > 0 ? { cashReceived: cents(op.input.cashReceived) / 100 } : {}),
      ...(op.result.voucher ? { voucher: { code: op.result.voucher.code, amount: op.result.voucher.amount } } : {}),
    };
    for (const movement of related) movement.exchangeReceipt = receipt;
    store.write(state);
    return receipt;
  });
}
