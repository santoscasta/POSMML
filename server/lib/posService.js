import { PosError } from './operationStore.js';
import { cents, paymentSplits } from './accounting.js';
import { randomBytes } from 'node:crypto';
import { fulfillSale } from './fulfillSale.js';

export function mutationResult(data, key, field) {
  const payload = data?.[key];
  if (payload?.userErrors?.length) {
    const error = new PosError(payload.userErrors.map(e => e.message).join(', '));
    error.definiteRejection = !payload[field];
    throw error;
  }
  if (!payload?.[field]) throw new Error(`Respuesta incompleta de ${key}`);
  return payload[field];
}

export async function currentSession(gql) {
  let after = null;
  const open = [];
  do {
    const data = await gql(`query PosSessions($after: String) {
      metaobjects(type: "$app:pos_session", first: 100, after: $after) {
        nodes { id updatedAt fields { key value } }
        pageInfo { hasNextPage endCursor }
      }
    }`, { after });
    open.push(...data.metaobjects.nodes.filter(n => n.fields.some(f => f.key === 'status' && f.value === 'OPEN')));
    after = data.metaobjects.pageInfo.hasNextPage ? data.metaobjects.pageInfo.endCursor : null;
  } while (after);
  if (open.length !== 1) throw new PosError(open.length ? 'Hay varias sesiones abiertas. Cierra las sesiones sobrantes.' : 'No hay sesión de caja abierta');
  return open[0];
}

function movement(ctx, value) {
  const existing = ctx.state.movements.find(p => p.id === ctx.op.key);
  if (existing) return existing;
  const entry = { id: ctx.op.key, createdAt: new Date().toISOString(), ...value };
  ctx.state.movements.push(entry);
  ctx.save();
  return entry;
}

export function createPosService(gql, store) {
  const operationTag = key => `pos-op-${key.replaceAll('-', '').slice(0, 24)}`;
  async function session(ctx) {
    if (!ctx.op.sessionId) {
      const current = await currentSession(gql);
      ctx.op.sessionId = current.id;
      ctx.state.sessionDates[current.id] ||= current.updatedAt;
      ctx.save();
    }
    return ctx.op.sessionId;
  }

  async function resolveVouchers(ctx, splits) {
    if (ctx.op.vouchers) return ctx.op.vouchers;
    const vouchers = [];
    for (const split of splits.filter(s => s.method === 'VOUCHER')) {
      // UI lookup returns maskedCode; search only its last four characters, and
      // require a unique exact match instead of debiting the first search hit.
      const code = split.voucherCode.trim().replace(/\s/g, '').slice(-4).toLowerCase();
      if (code.length !== 4) throw new PosError('Código de vale inválido');
      const data = await gql(`query PosVoucher($query: String!) {
        giftCards(first: 100, query: $query) { nodes { id lastCharacters enabled expiresOn balance { amount } } pageInfo { hasNextPage } }
      }`, { query: code });
      const matches = data.giftCards.nodes.filter(c => c.lastCharacters.toLowerCase() === code);
      if (matches.length !== 1 || data.giftCards.pageInfo.hasNextPage) throw new PosError('Vale no encontrado o código ambiguo');
      const card = matches[0];
      if (!card.enabled || (card.expiresOn && card.expiresOn < new Date().toISOString().slice(0, 10))) throw new PosError('Vale desactivado o caducado');
      const amount = cents(split.amount);
      const previous = vouchers.find(v => v.id === card.id);
      const debit = amount + (previous ? cents(previous.amount) : 0);
      if (cents(card.balance.amount) < debit) throw new PosError('Saldo insuficiente en el vale');
      if (previous) previous.amount = debit / 100;
      else vouchers.push({ id: card.id, amount: amount / 100 });
    }
    ctx.op.vouchers = vouchers;
    ctx.save();
    return vouchers;
  }

  async function debitVouchers(ctx, vouchers, orderName) {
    for (let index = 0; index < vouchers.length; index++) {
      const card = vouchers[index];
      await ctx.step(`voucher-debit-${index}`, async () => mutationResult(await gql(`mutation PosDebit($id: ID!, $input: GiftCardDebitInput!) {
        giftCardDebit(id: $id, debitInput: $input) { giftCardDebitTransaction { id } userErrors { message } }
      }`, { id: card.id, input: { debitAmount: { amount: card.amount.toFixed(2), currencyCode: 'EUR' }, note: `POS ${ctx.op.key} ${orderName}` } }), 'giftCardDebit', 'giftCardDebitTransaction'), async () => {
        let after = null;
        do {
          const data = await gql(`query PosDebitRecovery($id: ID!, $after: String) {
            giftCard(id: $id) { transactions(first: 100, after: $after) {
              nodes { id note amount { amount } } pageInfo { hasNextPage endCursor }
            } }
          }`, { id: card.id, after });
          const transactions = data.giftCard.transactions;
          const match = transactions.nodes.find(t => t.note === `POS ${ctx.op.key} ${orderName}` && Math.round(Number(t.amount.amount) * 100) === -cents(card.amount));
          if (match) return { id: match.id };
          after = transactions.pageInfo.hasNextPage ? transactions.pageInfo.endCursor : null;
        } while (after);
        return null;
      });
    }
  }

  async function checkout(key, input) {
    return store.operation(key, 'checkout', input, async ctx => {
      const { cart, payment } = input;
      const splits = paymentSplits(payment);
      if (!cart?.items?.length || cart.items.some(i => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(i.variantId) || !Number.isInteger(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.price) || i.price < 0)) throw new PosError('Carrito inválido');
      cart.items.forEach(i => cents(i.price));
      const sessionId = await session(ctx);
      const vouchers = await resolveVouchers(ctx, splits);
      const recoveryTag = operationTag(key);
      const draftInput = {
        lineItems: cart.items.map(i => ({
          variantId: i.variantId,
          quantity: i.quantity,
          priceOverride: { amount: i.price.toFixed(2), currencyCode: 'EUR' },
        })),
        tags: ['POS MML', recoveryTag],
      };
      if (cart.customer) draftInput.customerId = cart.customer.id;
      if (cart.note) draftInput.note = cart.note;
      if (cart.discount) {
        if (!['percentage', 'fixed'].includes(cart.discount.type) && cart.discount.type !== 'fixed_amount') throw new PosError('Descuento inválido');
        const value = Number(cart.discount.value);
        if (!Number.isFinite(value) || value < 0 || (cart.discount.type === 'percentage' && value > 100)) throw new PosError('Descuento inválido');
        draftInput.appliedDiscount = { valueType: cart.discount.type === 'percentage' ? 'PERCENTAGE' : 'FIXED_AMOUNT', value };
      }
      const draft = await ctx.step('draft-create', async () => mutationResult(await gql(`mutation PosDraft($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) { draftOrder { id totalPriceSet { shopMoney { amount currencyCode } } } userErrors { message } }
      }`, { input: draftInput }), 'draftOrderCreate', 'draftOrder'), async () => {
        const data = await gql(`query PosDraftRecovery($query: String!) {
          draftOrders(first: 100, query: $query) { nodes { id tags totalPriceSet { shopMoney { amount currencyCode } } } }
        }`, { query: `tag:${recoveryTag}` });
        const matches = data.draftOrders.nodes.filter(d => d.tags.includes(recoveryTag));
        return matches.length === 1 ? matches[0] : null;
      });
      if (draft.totalPriceSet.shopMoney.currencyCode !== 'EUR' || cents(draft.totalPriceSet.shopMoney.amount) !== cents(payment.amount)) throw new PosError('El total de Shopify difiere del cobro. Revisa el borrador antes de continuar.', 409, 'TOTAL_MISMATCH');
      // Complete as unpaid: a failed voucher debit must not leave a paid order.
      const completed = await ctx.step('draft-complete', async () => mutationResult(await gql(`mutation PosComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: true) { draftOrder { order { id name } } userErrors { message } }
      }`, { id: draft.id }), 'draftOrderComplete', 'draftOrder'), async () => {
        const data = await gql(`query PosCompleteRecovery($id: ID!) { draftOrder(id: $id) { order { id name } } }`, { id: draft.id });
        return data.draftOrder?.order?.id ? data.draftOrder : null;
      });
      const order = completed.order;
      if (!order?.id) throw new PosError('Pedido pendiente de comprobación', 409);
      await debitVouchers(ctx, vouchers, order.name);
      const paidOrder = async () => {
        const data = await gql(`query PosPaidRecovery($id: ID!) { order(id: $id) { id displayFinancialStatus } }`, { id: order.id });
        return data.order?.displayFinancialStatus === 'PAID' ? { id: data.order.id } : null;
      };
      for (let attempt = 0; ; attempt++) {
        try {
          await ctx.step('mark-paid', async () => {
        // Zero-value orders can already be paid after draft completion. Also
        // check before retrying a rejected payment on an existing order.
        let paid;
        try { paid = await paidOrder(); } catch (error) {
          // A read failed before any payment mutation: retry remains safe.
          error.definiteRejection = true;
          throw error;
        }
        if (paid) return paid;
        return mutationResult(await gql(`mutation PosPaid($input: OrderMarkAsPaidInput!) {
          orderMarkAsPaid(input: $input) { order { id } userErrors { message } }
        }`, { input: { id: order.id } }), 'orderMarkAsPaid', 'order');
          }, paidOrder);
          break;
        } catch (error) {
          // Only retry an explicit temporary rejection, never an unknown outcome.
          if (!error.definiteRejection || !/Order is temporarily unavailable to be modified/i.test(error.message)) throw error;
          if (attempt >= 3) {
            error.message = 'Shopify sigue preparando el pedido. Espera unos segundos y pulsa «Reanudar cobro pendiente».';
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
      const entry = movement(ctx, {
        shopifyOrderId: order.id, shopifyOrderName: order.name, sessionId,
        method: payment.method, amount: cents(payment.amount) / 100, type: 'sale',
        cashReceived: payment.cashReceived || 0,
        changeGiven: payment.method === 'CASH' ? (cents(payment.cashReceived) - cents(payment.amount)) / 100 : 0,
        ...(payment.method === 'MIXED' ? { mixedPayments: splits } : {}),
        voucherCode: payment.voucherCode || null,
      });
      try {
        await fulfillSale(gql, ctx, order.id);
      } catch (error) {
        error.message = `Pedido ${order.name} ya cobrado; falta confirmar la preparación. No vuelvas a cobrar. ${error.message}`;
        throw error;
      }
      return { success: true, ...entry, name: order.name };
    });
  }

  async function refund(key, input) {
    return store.operation(key, 'refund', input, async ctx => {
      if (!/^gid:\/\/shopify\/Order\/\d+$/.test(input.orderId) || !['CASH', 'CARD', 'VOUCHER'].includes(input.method) || cents(input.amount) <= 0) throw new PosError('Devolución inválida');
      const sessionId = await session(ctx);
      if (!ctx.op.refundInput) {
        const data = await gql(`query PosRefundOrder($id: ID!) {
          order(id: $id) { id name totalPriceSet { shopMoney { amount currencyCode } } totalRefundedSet { shopMoney { amount } }
            transactions(first: 100) { id kind status gateway amountSet { shopMoney { amount } } }
          }
        }`, { id: input.orderId });
        const order = data.order;
        if (!order || order.totalPriceSet.shopMoney.currencyCode !== 'EUR') throw new PosError('Pedido no encontrado o moneda no admitida');
        if (cents(input.amount) > cents(order.totalPriceSet.shopMoney.amount) - cents(order.totalRefundedSet.shopMoney.amount)) throw new PosError('El importe supera el saldo reembolsable');
        const parent = order.transactions.find(t => ['SALE', 'CAPTURE'].includes(t.kind) && t.status === 'SUCCESS');
        if (!parent || parent.gateway !== 'manual') throw new PosError('Este pedido requiere reembolso desde Shopify: no tiene un pago manual compatible.');
        const lines = input.refundLineItems || [];
        if (!Array.isArray(lines) || lines.some(i => !/^gid:\/\/shopify\/LineItem\/\d+$/.test(i.lineItemId) || !Number.isInteger(i.quantity) || i.quantity <= 0)) throw new PosError('Artículos de devolución inválidos');
        if (input.restock && lines.length && !input.locationId) throw new PosError('Selecciona la ubicación para reponer');
        ctx.op.orderName = order.name;
        ctx.op.refundInput = {
          orderId: input.orderId, notify: Boolean(input.notify), note: `${input.note || ''}\nPOS operación ${key}`.trim(),
          refundLineItems: lines.map(i => ({ lineItemId: i.lineItemId, quantity: i.quantity, restockType: input.restock ? 'RETURN' : 'NO_RESTOCK', ...(input.restock ? { locationId: input.locationId } : {}) })),
          transactions: [{ orderId: input.orderId, parentId: parent.id, amount: (cents(input.amount) / 100).toFixed(2), kind: 'REFUND', gateway: parent.gateway }],
        };
        ctx.save();
      }
      // Refund first. If it is rejected, no spendable gift card has been created.
      let result = await ctx.step('refund-create', async () => mutationResult(await gql(`mutation PosRefund($input: RefundInput!) {
        refundCreate(input: $input) { refund { id transactions(first: 100) { nodes { status } } } userErrors { message } }
      }`, { input: ctx.op.refundInput }), 'refundCreate', 'refund'), async () => {
        const data = await gql(`query PosRefundRecovery($id: ID!) {
          order(id: $id) { refunds { id note transactions(first: 100) { nodes { status } } } }
        }`, { id: input.orderId });
        const matches = data.order.refunds.filter(r => r.note === ctx.op.refundInput.note);
        return matches.length === 1 ? matches[0] : null;
      });
      if (result.transactions?.nodes?.some(t => t.status !== 'SUCCESS')) {
        const data = await gql(`query PosRefundStatus($id: ID!) { refund(id: $id) { id transactions(first: 100) { nodes { status } } } }`, { id: result.id });
        if (data.refund) result = data.refund;
      }
      if (!result.transactions?.nodes?.length || result.transactions.nodes.some(t => t.status !== 'SUCCESS')) {
        throw new PosError(`Devolución ${result.id} pendiente de confirmación en Shopify. No se ha emitido el vale.`, 409, 'RECONCILIATION_REQUIRED');
      }
      // Persist the actual refund immediately, even when voucher issuance needs
      // another attempt. Closing is blocked until the entire operation finishes.
      const entry = movement(ctx, { shopifyOrderId: input.orderId, shopifyOrderName: ctx.op.orderName,
        sessionId, type: 'refund', method: input.method, amount: cents(input.amount) / 100, refundId: result.id });
      let voucherCode;
      if (input.method === 'VOUCHER') {
        // Persist the code before creation so a lost Shopify response cannot
        // destroy the only copy of a customer's redeemable code.
        ctx.op.giftCardCode ||= randomBytes(8).toString('hex').toUpperCase();
        ctx.save();
        const card = await ctx.step('refund-voucher-create', async () => {
          const data = await gql(`mutation PosRefundVoucher($input: GiftCardCreateInput!) {
            giftCardCreate(input: $input) { giftCard { id } giftCardCode userErrors { message } }
          }`, { input: { code: ctx.op.giftCardCode, initialValue: (cents(input.amount) / 100).toFixed(2), note: `Devolución ${ctx.op.orderName}, ${result.id}, POS ${key}${input.customerName ? ` - ${input.customerName}` : ''}` } });
          const giftCard = mutationResult(data, 'giftCardCreate', 'giftCard');
          return { id: giftCard.id, code: ctx.op.giftCardCode };
        }, async () => {
          const data = await gql(`query PosRefundVoucherRecovery($query: String!) {
            giftCards(first: 100, query: $query) { nodes { id note lastCharacters initialValue { amount } } }
          }`, { query: ctx.op.giftCardCode.slice(-4) });
          const matches = data.giftCards.nodes.filter(c => c.lastCharacters.toUpperCase() === ctx.op.giftCardCode.slice(-4)
            && c.note?.includes(`POS ${key}`) && cents(c.initialValue.amount) === cents(input.amount));
          return matches.length === 1 ? { id: matches[0].id, code: ctx.op.giftCardCode } : null;
        });
        voucherCode = card.code;
        entry.voucherCode = voucherCode;
        ctx.save();
      }
      return { success: true, refundId: result.id, ...(voucherCode ? { voucherCode } : {}) };
    });
  }
  return { checkout, refund };
}
