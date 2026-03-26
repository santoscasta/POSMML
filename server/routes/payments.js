import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';

const router = Router();

const SESSION_TYPE = '$app:pos_session';

// Redeem a gift card in Shopify (debit its balance)
async function redeemGiftCard(code, amount, orderId) {
  const searchData = await shopifyGQL(
    `query($q: String!) {
      giftCards(first: 5, query: $q) {
        edges { node { id balance { amount } enabled } }
      }
    }`,
    { q: code },
  );

  const card = searchData.giftCards.edges[0]?.node;
  if (!card) throw new Error('Vale no encontrado');
  if (!card.enabled) throw new Error('Vale desactivado');
  if (parseFloat(card.balance.amount) < amount) throw new Error('Saldo insuficiente en el vale');

  const debitData = await shopifyGQL(
    `mutation($id: ID!, $debitInput: GiftCardDebitInput!) {
      giftCardDebit(id: $id, debitInput: $debitInput) {
        giftCardDebitTransaction { id amount { amount } }
        userErrors { field message }
      }
    }`,
    {
      id: card.id,
      debitInput: {
        debitAmount: { amount: amount.toFixed(2), currencyCode: 'EUR' },
        note: `Pago POS pedido ${orderId || ''}`,
      },
    },
  );

  if (debitData.giftCardDebit.userErrors?.length) {
    throw new Error(debitData.giftCardDebit.userErrors.map(e => e.message).join(', '));
  }

  return debitData.giftCardDebit.giftCardDebitTransaction;
}

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

// Record a payment
router.post('/payments', async (req, res) => {
  try {
    const { shopifyOrderId, shopifyOrderName, method, amount, cashReceived, changeGiven, type, notes, mixedPayments, voucherCode } = req.body;

    // Find current open session
    const sessionId = await getCurrentSessionId();
    if (!sessionId) return res.status(400).json({ error: 'No hay sesion de caja abierta' });

    // If paying with VOUCHER, redeem the gift card in Shopify
    if (method === 'VOUCHER' && voucherCode) {
      await redeemGiftCard(voucherCode, amount, shopifyOrderName);
    }

    // If mixed payment, check for VOUCHER splits and redeem them
    if (method === 'MIXED' && mixedPayments) {
      for (const mp of mixedPayments) {
        if (mp.method === 'VOUCHER' && mp.voucherCode) {
          await redeemGiftCard(mp.voucherCode, mp.amount, shopifyOrderName);
        }
      }
    }

    // Set metafields on the Shopify order
    const metafields = [
      { key: 'payment_method', value: method },
      { key: 'cash_received', value: String(cashReceived || 0), type: 'number_decimal' },
      { key: 'change_given', value: String(changeGiven || 0), type: 'number_decimal' },
      { key: 'session_id', value: sessionId },
      { key: 'payment_type', value: type || 'sale' },
      { key: 'voucher_code', value: voucherCode || '' },
    ];

    await setOrderMetafields(shopifyOrderId, metafields);

    res.json({
      success: true,
      shopifyOrderId,
      method,
      amount,
      cashReceived,
      changeGiven,
      sessionId,
      type: type || 'sale',
      voucherCode: voucherCode || null,
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get payments for a session — query orders with matching session_id metafield
router.get('/payments', async (req, res) => {
  try {
    const { sessionId } = req.query;

    // Get orders tagged POS MML with their metafields
    const data = await shopifyGQL(
      `{
        orders(first: 100, query: "tag:'POS MML'", sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id name createdAt
              totalPriceSet { shopMoney { amount } }
              metafields(first: 10, namespace: "pos_mml") {
                edges { node { key value } }
              }
            }
          }
        }
      }`,
    );

    let orders = data.orders.edges.map(e => {
      const o = e.node;
      const mfMap = {};
      for (const mf of o.metafields.edges) mfMap[mf.node.key] = mf.node.value;
      return {
        shopifyOrderId: o.id,
        shopifyOrderName: o.name,
        method: mfMap.payment_method || null,
        amount: parseFloat(o.totalPriceSet.shopMoney.amount) || 0,
        type: mfMap.payment_type || 'sale',
        cashReceived: mfMap.cash_received ? parseFloat(mfMap.cash_received) : null,
        changeGiven: mfMap.change_given ? parseFloat(mfMap.change_given) : null,
        sessionId: mfMap.session_id || null,
        voucherCode: mfMap.voucher_code || null,
        createdAt: o.createdAt,
      };
    });

    // Filter only orders that have payment info recorded
    orders = orders.filter(o => o.method);

    // Optionally filter by session
    if (sessionId) {
      orders = orders.filter(o => o.sessionId === sessionId);
    }

    res.json(orders);
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get payment info for a specific order — read metafields
router.get('/payments/order/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    // orderId should be a GID like gid://shopify/Order/123
    const data = await shopifyGQL(
      `query($id: ID!) {
        order(id: $id) {
          id name
          totalPriceSet { shopMoney { amount } }
          metafields(first: 10, namespace: "pos_mml") {
            edges { node { key value } }
          }
        }
      }`,
      { id: orderId },
    );

    if (!data.order) return res.json([]);

    const mfMap = {};
    for (const e of data.order.metafields.edges) mfMap[e.node.key] = e.node.value;

    // Return as array to match previous API shape
    if (!mfMap.payment_method) return res.json([]);

    res.json([{
      shopifyOrderId: data.order.id,
      shopifyOrderName: data.order.name,
      method: mfMap.payment_method,
      amount: parseFloat(data.order.totalPriceSet.shopMoney.amount) || 0,
      type: mfMap.payment_type || 'sale',
      cashReceived: mfMap.cash_received ? parseFloat(mfMap.cash_received) : null,
      changeGiven: mfMap.change_given ? parseFloat(mfMap.change_given) : null,
      sessionId: mfMap.session_id || null,
      voucherCode: mfMap.voucher_code || null,
    }]);
  } catch (err) {
    console.error('GET /payments/order error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
