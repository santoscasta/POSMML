import { Router } from 'express';
import { getAccessToken, SHOPIFY_STORE } from '../lib/shopify.js';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore } from '../lib/operationStore.js';
import { getPayments, computeKPIs } from '../lib/accounting.js';

const router = Router();

const SESSION_TYPE = '$app:pos_session';

router.get('/dashboard', async (req, res) => {
  try {
    // Current session from metaobjects (filter in code — Shopify query unreliable)
    const sessionData = await shopifyGQL(
      `{
        metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
          edges { node { id fields { key value } } }
        }
      }`,
    );
    const sessionEdge = sessionData.metaobjects.edges.find(e =>
      e.node.fields.find(f => f.key === 'status')?.value === 'OPEN'
    );
    const sessionOpen = !!sessionEdge;
    const sessionId = sessionEdge?.node?.id || null;

    // Today's orders tagged POS MML with their payment metafields
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const payments = await getPayments(shopifyGQL, getStore());
    const todayOrders = payments.filter(p => p.createdAt >= today.toISOString() && p.type === 'sale');
    const kpis = computeKPIs(todayOrders);
    const todaySales = kpis.grossSales;

    // Voucher stats from gift cards
    let activeVouchers = 0;
    let voucherBalance = 0;
    try {
      const gcData = await shopifyGQL(
        `{ giftCards(first: 250) { edges { node { balance { amount } enabled } } } }`,
      );
      for (const e of gcData.giftCards.edges) {
        const gc = e.node;
        const bal = parseFloat(gc.balance.amount);
        if (gc.enabled && bal > 0) {
          activeVouchers++;
          voucherBalance += bal;
        }
      }
    } catch (_) {
      // non-critical
    }

    // Shopify connection
    const token = await getAccessToken();

    res.json({
      shopifyConnected: !!token,
      store: SHOPIFY_STORE,
      sessionOpen,
      sessionId,
      todaySales,
      todayOrders: todayOrders.length,
      activeVouchers,
      voucherBalance,
      paymentBreakdown: {
        cash: kpis.cashSales,
        card: kpis.cardSales,
        bizum: kpis.bizumSales,
        mixed: todayOrders.filter(p => p.method === 'MIXED').reduce((s, p) => s + p.amount, 0),
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
});

export default router;
