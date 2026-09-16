import { Router } from 'express';
import { getAccessToken, SHOPIFY_STORE } from '../lib/shopify.js';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore } from '../lib/operationStore.js';
import { getPayments, computeKPIs } from '../lib/accounting.js';
import { currentSession } from '../lib/posService.js';
import { isBusinessToday } from '../lib/businessTime.js';

const router = Router();


router.get('/dashboard', async (req, res) => {
  try {
    let session = null;
    try { session = await currentSession(shopifyGQL); }
    catch (error) { if (error.message !== 'No hay sesión de caja abierta') throw error; }
    const sessionOpen = !!session;
    const sessionId = session?.id || null;
    const diagnostics = [];
    const payments = await getPayments(shopifyGQL, getStore(), { diagnostics });
    const now = Date.now();
    const todayOrders = payments.filter(p => isBusinessToday(p.createdAt, now) && p.type === 'sale');
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
      unregisteredOrders: diagnostics.filter(p => p.reason === 'missing_payment' && isBusinessToday(p.createdAt, now) && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.financialStatus)),
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
