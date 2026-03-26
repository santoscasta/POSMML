import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';

const router = Router();

const SESSION_TYPE = '$app:pos_session';

// ---------- helpers ----------

function parseMetaobject(node) {
  const obj = { id: node.id };
  for (const f of node.fields) {
    const key = f.key;
    const val = f.value;
    if (['opening_amount', 'closing_amount', 'expected_amount', 'difference'].includes(key)) {
      obj[camel(key)] = val !== null && val !== '' ? parseFloat(val) : null;
    } else {
      obj[camel(key)] = val;
    }
  }
  // Use updatedAt as a fallback for openedAt
  if (node.updatedAt) obj.openedAt = obj.openedAt || node.updatedAt;
  return obj;
}

function camel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Query orders tagged 'POS MML' created after a given date, with pos_mml metafields
async function getSessionOrders(sessionId, createdAfter) {
  const dateFilter = createdAfter ? `created_at:>'${createdAfter}'` : '';
  const query = `tag:'POS MML' ${dateFilter}`.trim();

  let allOrders = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const data = await shopifyGQL(
      `{
        orders(first: 50, query: "${query}"${afterArg}) {
          edges {
            cursor
            node {
              id
              name
              totalPriceSet { shopMoney { amount } }
              metafields(first: 10, namespace: "pos_mml") {
                edges { node { key value } }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`,
    );

    const edges = data.orders.edges;
    allOrders = allOrders.concat(edges.map(e => e.node));
    hasNext = data.orders.pageInfo.hasNextPage;
    cursor = edges.length ? edges[edges.length - 1].cursor : null;
  }

  // Filter to only orders belonging to this session
  return allOrders.filter(o => {
    const mf = o.metafields.edges.find(e => e.node.key === 'session_id');
    return mf && mf.node.value === sessionId;
  });
}

function computeKPIs(orders, openingAmount) {
  const sales = [];
  const refunds = [];

  for (const o of orders) {
    const mfMap = {};
    for (const e of o.metafields.edges) {
      mfMap[e.node.key] = e.node.value;
    }
    const amount = parseFloat(o.totalPriceSet.shopMoney.amount) || 0;
    const method = mfMap.payment_method || 'CASH';
    const type = mfMap.payment_type || 'sale';

    const entry = { amount, method, type };
    if (type === 'refund') refunds.push(entry);
    else sales.push(entry);
  }

  const grossSales = sales.reduce((s, p) => s + p.amount, 0);
  const totalRefunds = refunds.reduce((s, p) => s + p.amount, 0);

  let cashSales = 0, cardSales = 0, bizumSales = 0, voucherSales = 0;
  for (const p of sales) {
    if (p.method === 'CASH') cashSales += p.amount;
    else if (p.method === 'CARD') cardSales += p.amount;
    else if (p.method === 'BIZUM') bizumSales += p.amount;
    else if (p.method === 'VOUCHER') voucherSales += p.amount;
    else if (p.method === 'MIXED') {
      // For MIXED, the total goes to mixed; individual splits are tracked on the order
      // but since we store only the primary method, count as mixed/cash by default
      cashSales += p.amount;
    }
  }

  let refundsCash = 0;
  for (const p of refunds) {
    if (p.method === 'CASH') refundsCash += p.amount;
  }

  const opening = typeof openingAmount === 'number' ? openingAmount : 0;

  return {
    totalOrders: sales.length,
    grossSales,
    cashSales,
    cardSales,
    bizumSales,
    voucherSales,
    refunds: totalRefunds,
    refundsCash,
    expectedCash: opening + cashSales - refundsCash,
  };
}

// ---------- routes ----------

// Get current open session
router.get('/sessions/current', async (req, res) => {
  try {
    // Fetch recent sessions and filter in code (Shopify metaobject query filtering is unreliable)
    const data = await shopifyGQL(
      `{
        metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
          edges { node { id updatedAt fields { key value } } }
        }
      }`,
    );

    const openEdge = data.metaobjects.edges.find(e => {
      const statusField = e.node.fields.find(f => f.key === 'status');
      return statusField && statusField.value === 'OPEN';
    });
    if (!openEdge) return res.json(null);

    const session = parseMetaobject(openEdge.node);
    const orders = await getSessionOrders(session.id, session.openedAt);
    const kpis = computeKPIs(orders, session.openingAmount);
    res.json({ ...session, kpis });
  } catch (err) {
    console.error('GET /sessions/current error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Open a new session
router.post('/sessions/open', async (req, res) => {
  try {
    // Check no open session exists (filter in code — Shopify query filter unreliable)
    const check = await shopifyGQL(
      `{
        metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
          edges { node { id fields { key value } } }
        }
      }`,
    );
    const { openingAmount, cashierName, notes, force } = req.body;

    const openSessions = check.metaobjects.edges.filter(e =>
      e.node.fields.find(f => f.key === 'status')?.value === 'OPEN'
    );

    if (openSessions.length > 0) {
      if (!force) {
        return res.status(400).json({ error: 'Ya hay una sesion abierta' });
      }
      // Force: close all open sessions
      for (const s of openSessions) {
        await shopifyGQL(
          `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject { id }
              userErrors { field message }
            }
          }`,
          { id: s.node.id, metaobject: { fields: [
            { key: 'status', value: 'CLOSED' },
            { key: 'closed_at', value: new Date().toISOString() },
            { key: 'notes', value: 'Cierre forzado' },
          ] } },
        );
      }
    }

    const fields = [
      { key: 'cashier_name', value: cashierName || 'Cajero' },
      { key: 'opening_amount', value: String(openingAmount || 0) },
      { key: 'closing_amount', value: '0' },
      { key: 'expected_amount', value: '0' },
      { key: 'difference', value: '0' },
      { key: 'status', value: 'OPEN' },
      { key: 'closed_at', value: '' },
      { key: 'notes', value: notes || '' },
    ];

    const data = await shopifyGQL(
      `mutation($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id updatedAt fields { key value } }
          userErrors { field message }
        }
      }`,
      {
        metaobject: {
          type: SESSION_TYPE,
          fields,
        },
      },
    );

    if (data.metaobjectCreate.userErrors?.length) {
      return res.status(400).json({ error: data.metaobjectCreate.userErrors.map(e => e.message).join(', ') });
    }

    const session = parseMetaobject(data.metaobjectCreate.metaobject);
    res.json(session);
  } catch (err) {
    console.error('POST /sessions/open error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Close session
router.post('/sessions/close', async (req, res) => {
  try {
    const { sessionId: id, closingAmount, notes, force } = req.body;
    if (!id) return res.status(400).json({ error: 'sessionId requerido' });

    // Fetch session
    const fetchData = await shopifyGQL(
      `query($id: ID!) {
        metaobject(id: $id) { id updatedAt fields { key value } }
      }`,
      { id },
    );
    if (!fetchData.metaobject) return res.status(404).json({ error: 'Sesion no encontrada' });

    const session = parseMetaobject(fetchData.metaobject);
    if (session.status === 'CLOSED' && !force) return res.status(400).json({ error: 'Sesion ya cerrada' });

    // Compute KPIs from orders
    const orders = await getSessionOrders(id, session.openedAt);
    const kpis = computeKPIs(orders, session.openingAmount);

    const expectedAmount = (session.openingAmount || 0) + kpis.cashSales - kpis.refundsCash;
    const difference = (closingAmount || 0) - expectedAmount;
    const closedAt = new Date().toISOString();

    const fields = [
      { key: 'status', value: 'CLOSED' },
      { key: 'closed_at', value: closedAt },
      { key: 'closing_amount', value: String(closingAmount || 0) },
      { key: 'expected_amount', value: String(expectedAmount) },
      { key: 'difference', value: String(difference) },
    ];
    if (notes) {
      fields.push({ key: 'notes', value: notes });
    }

    const updateData = await shopifyGQL(
      `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id updatedAt fields { key value } }
          userErrors { field message }
        }
      }`,
      { id, metaobject: { fields } },
    );

    if (updateData.metaobjectUpdate.userErrors?.length) {
      return res.status(400).json({ error: updateData.metaobjectUpdate.userErrors.map(e => e.message).join(', ') });
    }

    const updated = parseMetaobject(updateData.metaobjectUpdate.metaobject);

    // Build detailed order list for the closing report
    const orderDetails = orders.map(o => {
      const mfMap = {};
      for (const e of o.metafields.edges) mfMap[e.node.key] = e.node.value;
      return {
        name: o.name,
        amount: parseFloat(o.totalPriceSet.shopMoney.amount) || 0,
        method: mfMap.payment_method || 'CASH',
        type: mfMap.payment_type || 'sale',
        voucherCode: mfMap.voucher_code || null,
      };
    });

    res.json({ ...updated, kpis, orderDetails });
  } catch (err) {
    console.error('POST /sessions/:id/close error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List sessions (last 10)
router.get('/sessions', async (req, res) => {
  try {
    const data = await shopifyGQL(
      `{
        metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
          edges { node { id updatedAt fields { key value } } }
        }
      }`,
    );

    const sessions = [];
    for (const edge of data.metaobjects.edges) {
      const session = parseMetaobject(edge.node);
      const orders = await getSessionOrders(session.id, session.openedAt);
      const kpis = computeKPIs(orders, session.openingAmount);
      sessions.push({ ...session, kpis });
    }
    res.json(sessions);
  } catch (err) {
    console.error('GET /sessions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Session detail
router.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const data = await shopifyGQL(
      `query($id: ID!) {
        metaobject(id: $id) { id updatedAt fields { key value } }
      }`,
      { id },
    );
    if (!data.metaobject) return res.status(404).json({ error: 'No encontrada' });

    const session = parseMetaobject(data.metaobject);
    const orders = await getSessionOrders(session.id, session.openedAt);
    const kpis = computeKPIs(orders, session.openingAmount);

    // Build a payments-like array from order metafields for the detail view
    const payments = orders.map(o => {
      const mfMap = {};
      for (const e of o.metafields.edges) mfMap[e.node.key] = e.node.value;
      return {
        shopifyOrderId: o.id,
        shopifyOrderName: o.name,
        method: mfMap.payment_method || 'CASH',
        amount: parseFloat(o.totalPriceSet.shopMoney.amount) || 0,
        type: mfMap.payment_type || 'sale',
        cashReceived: mfMap.cash_received ? parseFloat(mfMap.cash_received) : null,
        changeGiven: mfMap.change_given ? parseFloat(mfMap.change_given) : null,
        voucherCode: mfMap.voucher_code || null,
      };
    });

    res.json({ ...session, payments, kpis });
  } catch (err) {
    console.error('GET /sessions/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
