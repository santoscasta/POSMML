import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';

const router = Router();

const SESSION_TYPE = '$app:pos_session';

// Helper: find current open session GID
async function getCurrentSessionId() {
  const data = await shopifyGQL(
    `{
      metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
        edges { node { id fields { key value } } }
      }
    }`,
  );
  const open = data.metaobjects.edges.find(e =>
    e.node.fields.find(f => f.key === 'status')?.value === 'OPEN'
  );
  return open?.node?.id || null;
}

// Helper: set metafields on a Shopify order
async function setOrderMetafields(orderId, metafields) {
  const data = await shopifyGQL(
    `mutation($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: orderId,
        metafields: metafields.map(mf => ({
          namespace: 'pos_mml',
          key: mf.key,
          value: String(mf.value),
          type: mf.type || 'single_line_text_field',
        })),
      },
    },
  );

  if (data.orderUpdate.userErrors?.length) {
    throw new Error(data.orderUpdate.userErrors.map(e => e.message).join(', '));
  }
  return data.orderUpdate.order;
}

// Create refund
router.post('/refunds', async (req, res) => {
  try {
    const { orderId, refundLineItems, notify, note, restock, locationId, method } = req.body;
    const refundAmount = parseFloat(req.body.amount || 0);

    // Get the parent transaction (SALE with SUCCESS) to reference in refund
    const orderData = await shopifyGQL(
      `query($id: ID!) {
        order(id: $id) {
          transactions(first: 10) { id kind status amountSet { shopMoney { amount } } }
        }
      }`,
      { id: orderId },
    );

    const parentTransaction = orderData.order.transactions.find(
      t => t.kind === 'SALE' && t.status === 'SUCCESS',
    );

    // If method is VOUCHER, create the gift card FIRST so we can include the code in the refund note
    let voucherCode = null;
    if (method === 'VOUCHER' && refundAmount > 0) {
      const customerName = req.body.customerName || '';
      const gcData = await shopifyGQL(
        `mutation($input: GiftCardCreateInput!) {
          giftCardCreate(input: $input) {
            giftCard { id lastCharacters maskedCode }
            giftCardCode
            userErrors { field message }
          }
        }`,
        {
          input: {
            initialValue: refundAmount,
            note: `Reembolso ${req.body.orderName || orderId}${customerName ? ` - ${customerName}` : ''}`,
          },
        },
      );
      if (gcData.giftCardCreate.userErrors?.length) {
        console.error('Gift card creation failed:', gcData.giftCardCreate.userErrors);
      } else {
        voucherCode = gcData.giftCardCreate.giftCardCode;
      }
    }

    // Build refund input -- include voucher code in the note
    const refundNote = voucherCode
      ? `Vale generado: ${voucherCode}${note ? ` | ${note}` : ''}`
      : (note || '');
    const input = { orderId, notify: notify || false, note: refundNote };

    if (refundLineItems && refundLineItems.length > 0) {
      input.refundLineItems = refundLineItems.map(item => ({
        lineItemId: item.lineItemId,
        quantity: item.quantity,
        restockType: restock ? 'RETURN' : 'NO_RESTOCK',
        ...(restock && locationId ? { locationId } : {}),
      }));
    }

    // Add transaction for the monetary refund
    if (parentTransaction && refundAmount > 0) {
      input.transactions = [{
        orderId,
        parentId: parentTransaction.id,
        amount: refundAmount,
        kind: 'REFUND',
        gateway: 'manual',
      }];
    }

    const data = await shopifyGQL(
      `mutation RefundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund { id }
          userErrors { field message }
        }
      }`,
      { input },
    );

    if (data.refundCreate.userErrors?.length) {
      return res.status(400).json({ error: data.refundCreate.userErrors.map(e => e.message).join(', ') });
    }

    // Record refund payment as metafields on the order
    if (method) {
      const sessionId = await getCurrentSessionId();
      const metafields = [
        { key: 'payment_method', value: method },
        { key: 'payment_type', value: 'refund' },
        { key: 'refund_method', value: method },
        { key: 'session_id', value: sessionId || '' },
        { key: 'voucher_code', value: voucherCode || '' },
        { key: 'cash_received', value: '0', type: 'number_decimal' },
        { key: 'change_given', value: '0', type: 'number_decimal' },
      ];
      try {
        await setOrderMetafields(orderId, metafields);
      } catch (mfErr) {
        console.error('Failed to set refund metafields on order:', mfErr);
        // Non-blocking: refund already succeeded
      }
    }

    res.json({
      success: true,
      refundId: data.refundCreate.refund.id,
      ...(voucherCode && { voucherCode }),
    });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: err.message });
  }
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
    res.status(500).json({ error: err.message });
  }
});

// Mark order as paid
router.post('/orders/mark-paid', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fulfill order
router.post('/orders/fulfill', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel order
router.post('/orders/cancel', async (req, res) => {
  try {
    const { orderId, reason, refund, restock } = req.body;
    const data = await shopifyGQL(
      `mutation($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
        orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock) {
          orderCancelUserErrors { field message }
        }
      }`,
      { orderId, reason: reason || 'OTHER', refund: refund ?? true, restock: restock ?? true },
    );
    if (data.orderCancel.orderCancelUserErrors?.length) {
      return res.status(400).json({ error: data.orderCancel.orderCancelUserErrors.map(e => e.message).join(', ') });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
