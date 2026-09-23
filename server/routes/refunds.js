import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore, PosError } from '../lib/operationStore.js';
import { createPosService } from '../lib/posService.js';
import { sendOperationError } from './payments.js';

import { quoteExchange, exchangeItems, getExchangeReceipt } from '../lib/exchange.js';

const router = Router();
router.post('/exchanges/quote', async (req, res) => {
  try { res.json(await quoteExchange(shopifyGQL, req.body, getStore())); } catch (error) { sendOperationError(res, error); }
});
router.post('/exchanges', async (req, res) => {
  try { const { operationId, ...input } = req.body; res.json(await exchangeItems(shopifyGQL, getStore(), operationId, input)); } catch (error) { sendOperationError(res, error); }
});
router.get('/exchanges/:exchangeId/receipt', async (req, res) => {
  try { res.json(await getExchangeReceipt(shopifyGQL, getStore(), req.params.exchangeId)); } catch (error) { sendOperationError(res, error); }
});
router.post('/refunds', async (req, res) => {
  try {
    const { operationId, ...input } = req.body;
    res.json(await createPosService(shopifyGQL, getStore()).refund(operationId, input));
  } catch (error) { sendOperationError(res, error); }
});

// Get locations
router.get('/locations', async (req, res) => {
  try {
    const data = await shopifyGQL(
      `{ locations(first: 20) { edges { node { id name isActive } } } }`,
    );
    const locations = data.locations.edges
      .map(e => e.node)
      .filter(l => l.isActive);
    res.json(locations);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function assertOrderIdle(orderId) {
  const pending = Object.values(getStore().read().operations).find(op => !op.result &&
    (op.input.orderId === orderId || op.steps['draft-complete']?.value?.order?.id === orderId || Object.values(op.children || {}).some(child => child.steps?.['draft-complete']?.value?.order?.id === orderId)));
  if (pending) throw new PosError(`Reanuda primero la operación pendiente ${pending.key}`, 409);
}

// Mark order as paid
router.post('/orders/mark-paid', async (req, res) => {
  try {
    await getStore().exclusive(async () => {
      assertOrderIdle(req.body.orderId);
      const { orderId } = req.body;
      const data = await shopifyGQL(
        `mutation($input: OrderMarkAsPaidInput!) {
          orderMarkAsPaid(input: $input) {
            order { id displayFinancialStatus }
            userErrors { field message }
          }
        }`,
        { input: { id: orderId } },
      );
      if (data.orderMarkAsPaid.userErrors?.length) {
        return res.status(400).json({ error: data.orderMarkAsPaid.userErrors.map(e => e.message).join(', ') });
      }
      res.json(data.orderMarkAsPaid.order);
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fulfill order
router.post('/orders/fulfill', async (req, res) => {
  try {
    await getStore().exclusive(async () => {
      assertOrderIdle(req.body.orderId);
      const { orderId } = req.body;
      // First get fulfillment orders
      const foData = await shopifyGQL(
        `query($id: ID!) {
          order(id: $id) {
            fulfillmentOrders(first: 5) {
              edges { node { id status lineItems(first: 50) { edges { node { id remainingQuantity } } } } }
            }
          }
        }`,
        { id: orderId },
      );

      const openFO = foData.order.fulfillmentOrders.edges
        .map(e => e.node)
        .find(fo => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS');

      if (!openFO) {
        return res.status(400).json({ error: 'No hay items pendientes de envio' });
      }

      const lineItems = openFO.lineItems.edges
        .filter(e => e.node.remainingQuantity > 0)
        .map(e => ({ id: e.node.id, quantity: e.node.remainingQuantity }));

      const data = await shopifyGQL(
        `mutation($fulfillment: FulfillmentV2Input!) {
          fulfillmentCreateV2(fulfillment: $fulfillment) {
            fulfillment { id status }
            userErrors { field message }
          }
        }`,
        { fulfillment: { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: openFO.id, fulfillmentOrderLineItems: lineItems }] } },
      );

      if (data.fulfillmentCreateV2.userErrors?.length) {
        return res.status(400).json({ error: data.fulfillmentCreateV2.userErrors.map(e => e.message).join(', ') });
      }
      res.json({ success: true });
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Cancel order
router.post('/orders/cancel', async (req, res) => {
  try {
    await getStore().exclusive(async () => {
      assertOrderIdle(req.body.orderId);
      const { orderId, reason, refund, restock } = req.body;
      if (refund !== false) {
        const current = await shopifyGQL(`query($id: ID!) { order(id: $id) { totalReceivedSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } }`, { id: orderId });
        if (!current.order) throw new PosError('Pedido no encontrado', 404);
        if (Number(current.order.totalReceivedSet.shopMoney.amount) > Number(current.order.totalRefundedSet.shopMoney.amount)) {
          throw new PosError('Reembolsa primero el pedido desde «Reembolso» para registrar el método y la caja; después podrás cancelarlo.', 409);
        }
      }
      const data = await shopifyGQL(
        `mutation($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
          orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock) {
            orderCancelUserErrors { field message }
          }
        }`,
        { orderId, reason: reason || 'OTHER', refund: false, restock: restock ?? true },
      );
      if (data.orderCancel.orderCancelUserErrors?.length) {
        return res.status(400).json({ error: data.orderCancel.orderCancelUserErrors.map(e => e.message).join(', ') });
      }
      res.json({ success: true });
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
