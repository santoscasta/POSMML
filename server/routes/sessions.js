import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore, PosError } from '../lib/operationStore.js';
import { mutationResult, currentSession } from '../lib/posService.js';
import { getPayments, computeKPIs, collectedSaleAmount, cents } from '../lib/accounting.js';
import { isBusinessToday } from '../lib/businessTime.js';

const router = Router();

const SESSION_TYPE = '$app:pos_session';

// ---------- helpers ----------

export function parseSession(node, sessionDates = {}) {
  const obj = { id: node.id };
  for (const f of node.fields) {
    const key = f.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    obj[key] = ['opening_amount', 'closing_amount', 'expected_amount', 'difference'].includes(f.key)
      ? (f.value !== null && f.value !== '' ? Number(f.value) : null) : f.value;
  }
  // Never turn updatedAt at closing into the opening date. Historical closed
  // sessions without a known opening date are explicitly shown as unknown.
  obj.openedAt = obj.openedAt || sessionDates[node.id] || (obj.status === 'OPEN' ? node.updatedAt : null);
  return obj;
}

function parseMetaobject(node) {
  return parseSession(node, getStore().read().sessionDates);
}

async function getSessionOrders(sessionId) {
  return getPayments(shopifyGQL, getStore(), { sessionId });
}

function assertNoPending(sessionId) {
  const pending = Object.values(getStore().read().operations).find(op =>
    op.sessionId === sessionId && !op.result && Object.values(op.steps).some(step => step.status === 'done' || step.status === 'running'));
  if (pending) throw new PosError(`La operación ${pending.key} está pendiente. Complétala antes de cerrar caja.`, 409);
}

function rememberOpening(session) {
  if (!session.openedAt) return;
  const store = getStore();
  const state = store.read();
  state.sessionDates[session.id] ||= session.openedAt;
  store.write(state);
}

function summarize(orders, openingAmount) {
  try { return { kpis: computeKPIs(orders, openingAmount) }; }
  catch (error) {
    if (error.code !== 'LEGACY_RECONCILIATION_REQUIRED') throw error;
    return { accountingError: error.message };
  }
}

// ---------- routes ----------

// Get current open session
router.get('/sessions/current', async (req, res) => {
  try {
    let current;
    try { current = await currentSession(shopifyGQL); }
    catch (error) { if (error.message === 'No hay sesión de caja abierta') return res.json(null); throw error; }
    const session = parseMetaobject(current);
    const diagnostics = [];
    const orders = await getPayments(shopifyGQL, getStore(), { sessionId: session.id, diagnostics });
    res.json({ ...session, ...summarize(orders, session.openingAmount),
      countedOrders: orders.filter(p => p.type === 'sale').map(p => ({
        name: p.shopifyOrderName, amount: collectedSaleAmount(p), method: p.exchangeId ? 'EXCHANGE' : p.method, createdAt: p.createdAt,
      })),
      unregisteredOrders: diagnostics.filter(p => isBusinessToday(p.createdAt) && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.financialStatus)),
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /sessions/current error:', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

// Open a new session
router.post('/sessions/open', async (req, res) => {
  try {
    await getStore().exclusive(async () => {
      const { openingAmount, cashierName, notes, force } = req.body;
      if (typeof openingAmount !== 'number') throw new PosError('Indica el fondo de caja inicial');
      cents(openingAmount);

      // Check no open session exists (filter in code — Shopify query filter unreliable)
      const check = await shopifyGQL(
        `{
          metaobjects(type: "${SESSION_TYPE}", first: 10, sortKey: "updated_at", reverse: true) {
            edges { node { id updatedAt fields { key value } } }
          }
        }`,
      );

      const openSessions = check.metaobjects.edges.filter(e =>
        e.node.fields.find(f => f.key === 'status')?.value === 'OPEN'
      );

      if (openSessions.length > 0) {
        if (!force) {
          return res.status(400).json({ error: 'Ya hay una sesion abierta' });
        }
        // Force: close all open sessions
        for (const s of openSessions) {
          assertNoPending(s.node.id);
          rememberOpening(parseMetaobject(s.node));
          const closed = await shopifyGQL(
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
          mutationResult(closed, 'metaobjectUpdate', 'metaobject');
        }
        // Confirm remote state before creating a replacement session.
        let stillOpen = false;
        try { await currentSession(shopifyGQL); stillOpen = true; }
        catch (error) { if (error.message !== 'No hay sesión de caja abierta') throw error; }
        if (stillOpen) throw new PosError('La caja anterior sigue abierta. Reintenta su cierre antes de abrir otra.', 409);
      }

      const fields = [
        { key: 'cashier_name', value: cashierName || 'Cajero' },
        { key: 'opening_amount', value: String(openingAmount) },
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
      rememberOpening(session);
      res.json(session);
    });
  } catch (err) {
    console.error('POST /sessions/open error:', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

// Close session
router.post('/sessions/close', async (req, res) => {
  try {
    await getStore().exclusive(async () => {
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
      cents(closingAmount || 0);
      assertNoPending(id);
      rememberOpening(session);
      if (session.status === 'CLOSED' && !force) return res.status(400).json({ error: 'Sesion ya cerrada' });

      // Compute KPIs from orders
      const orders = await getSessionOrders(id);
      const kpis = computeKPIs(orders, session.openingAmount);

      const expectedAmount = kpis.expectedCash;
      const difference = Math.round(((closingAmount || 0) - expectedAmount) * 100) / 100;
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
      const orderDetails = orders.filter(p => p.type !== 'exchange_return' && !(p.exchangeId && p.type === 'refund'))
        .map(p => ({ ...p, name: p.shopifyOrderName, amount: p.type === 'sale' ? collectedSaleAmount(p) : p.amount }));

      res.json({ ...updated, kpis, orderDetails });
    });
  } catch (err) {
    console.error('POST /sessions/:id/close error:', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
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
      const orders = await getSessionOrders(session.id);
      sessions.push({ ...session, ...summarize(orders, session.openingAmount) });
    }
    res.json(sessions);
  } catch (err) {
    console.error('GET /sessions error:', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
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
    const orders = await getSessionOrders(session.id);

    // Build a payments-like array from order metafields for the detail view
    const payments = orders;

    res.json({ ...session, payments, ...summarize(orders, session.openingAmount) });
  } catch (err) {
    console.error('GET /sessions/:id error:', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

export default router;
