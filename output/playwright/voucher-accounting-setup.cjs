async (page) => {
  const money = amount => ({ shopMoney: { amount: String(amount), currencyCode: 'EUR' } });
  const order = { id: 'gid://shopify/Order/15046', name: '#15046', createdAt: '2026-09-30T10:50:00Z', tags: ['POS MML'], displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', totalPriceSet: money('29.50'), subtotalPriceSet: money('29.50'), totalTaxSet: money('5.12'), totalDiscountsSet: money('0'), totalRefundedSet: money('0'), customer: null, metafields: { edges: [] }, refunds: [], lineItems: { edges: [{ node: { id: 'gid://shopify/LineItem/1', title: 'Bailarina Exploradores', quantity: 1, variant: { title: '9-12 meses' }, originalTotalSet: money('29.50'), originalUnitPriceSet: money('29.50') } }], pageInfo: { hasNextPage: false } } };
  const payment = { method: 'MIXED', amount: 29.50, type: 'sale', shopifyOrderName: '#15046', mixedPayments: [{ method: 'VOUCHER', amount: 24.85, voucherCode: '****2e3a' }, { method: 'CARD', amount: 4.65 }] };
  const session = { id: 'qa-session', status: 'OPEN', cashierName: 'QA', openedAt: '2026-09-30T08:00:00Z', openingAmount: 271.30, kpis: { totalOrders: 1, grossSales: 29.50, collectedSales: 4.65, cashSales: 0, cardSales: 4.65, bizumSales: 0, voucherSales: 24.85, refunds: 0, refundsCash: 0, expectedCash: 271.30 }, countedOrders: [{ name: '#15046', createdAt: order.createdAt, method: 'MIXED', mixedPayments: payment.mixedPayments, amount: 4.65, purchaseAmount: 29.50, cashAmount: 0 }], unregisteredOrders: [{ id: 'gid://shopify/Order/15043', name: '#15043', amount: 10, reason: 'missing_payment', financialStatus: 'PAID' }] };
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    let body = {};
    if (url.pathname.endsWith('/sessions/current')) body = session;
    else if (url.pathname.endsWith('/sessions/reconcile-order')) {
      const input = request.postDataJSON();
      if (input.payment.method !== 'CARD' || input.payment.amount !== 10 || input.orderId !== 'gid://shopify/Order/15043') throw Error('Invalid reconciliation payload');
      session.unregisteredOrders = []; body = { success: true };
    }
    else if (url.pathname.endsWith('/sessions') || url.pathname.endsWith('/operations/pending')) body = [];
    else if (url.pathname.includes('/payments/order/')) body = [payment];
    else if (url.pathname.endsWith('/graphql')) {
      const input = request.postDataJSON();
      if (input.query.includes('GetOrders')) body = { data: { orders: { edges: [{ node: order }], pageInfo: { hasNextPage: false } } } };
      else if (input.query.includes('OrderDetail')) body = { data: { order } };
      else if (input.query.includes('PosCategories')) body = { data: { metaobjects: { nodes: [], pageInfo: { hasNextPage: false } } } };
      else body = { data: { products: { edges: [], pageInfo: { hasNextPage: false } } } };
    }
    else if (url.pathname.endsWith('/vouchers/stats')) body = { total: 1, active: 1, exhausted: 0, cancelled: 0, activeBalance: 24.85 };
    else if (url.pathname.endsWith('/vouchers')) body = [];
    else if (url.pathname.includes('/vouchers/')) body = { id: 'gift-1', code: '****2E3A', status: 'ACTIVE', currentBalance: 24.85 };
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1366, height: 950 });
  await page.goto('http://127.0.0.1:5179/caja');
  return { mockData: true, pageErrors };
}
