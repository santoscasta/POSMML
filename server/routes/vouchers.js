import { Router } from 'express';
import { getAccessToken, SHOPIFY_STORE, API_VERSION } from '../lib/shopify.js';

const router = Router();

async function shopifyGQL(query, variables = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    },
  );
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e => e.message).join(', '));
  return data.data;
}

function parseNoteMetadata(note) {
  if (!note) return {};
  // Try to parse structured metadata from note (format: JSON block at end)
  const jsonMatch = note.match(/\n---POS_META---\n(.+)$/s);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch { /* ignore */ }
  }
  // Fallback: try to extract customer name from old format "Vale POS MML - Name"
  const nameMatch = note.match(/^Vale POS MML\s*-\s*(.+)$/);
  if (nameMatch) return { customerName: nameMatch[1].trim() };
  return {};
}

function buildNoteWithMeta(displayNote, meta) {
  const metaStr = JSON.stringify(meta);
  return `${displayNote}\n---POS_META---\n${metaStr}`;
}

function mapGiftCard(gc) {
  const balance = parseFloat(gc.balance.amount);
  const initial = parseFloat(gc.initialValue.amount);

  // Map transactions
  const transactions = (gc.transactions?.edges || []).map(e => {
    const t = e.node;
    const amt = parseFloat(t.amount.amount);
    let type = 'UNKNOWN';
    if (amt > 0) type = 'CREDIT';      // gift card creation or credit
    else if (amt < 0) type = 'DEBIT';   // payment / debit
    return {
      id: t.id,
      type,
      amount: Math.abs(amt),
      currency: t.amount.currencyCode,
      note: t.note || null,
      processedAt: t.processedAt,
    };
  });

  // Extract metadata from note
  const meta = parseNoteMetadata(gc.note);
  const displayNote = gc.note ? gc.note.replace(/\n---POS_META---\n.+$/s, '').trim() : null;

  // Customer name: prefer Shopify customer, then metadata, then null
  const customerName = gc.customer
    ? `${gc.customer.firstName || ''} ${gc.customer.lastName || ''}`.trim() || null
    : meta.customerName || null;
  const customerEmail = gc.customer?.email || meta.customerEmail || null;

  return {
    id: gc.id,
    code: gc.maskedCode || `****${gc.lastCharacters}`,
    lastCharacters: gc.lastCharacters,
    originalAmount: initial,
    currentBalance: balance,
    currency: gc.balance.currencyCode,
    customerName,
    customerEmail,
    status: !gc.enabled ? 'CANCELLED' : balance <= 0 ? 'EXHAUSTED' : 'ACTIVE',
    notes: displayNote,
    originOrderId: gc.order?.name || null,
    issuedAt: gc.createdAt,
    expiresOn: gc.expiresOn,
    transactions,
  };
}

const GC_FIELDS = `
  id balance { amount currencyCode } initialValue { amount currencyCode }
  lastCharacters maskedCode createdAt enabled expiresOn
  customer { firstName lastName email }
  note order { name }
  transactions(first: 50, reverse: true) {
    edges { node { id amount { amount currencyCode } note processedAt } }
  }
`;

// List
router.get('/vouchers', async (req, res) => {
  try {
    const { status, search } = req.query;
    const data = await shopifyGQL(
      `query($first: Int!, $query: String) {
        giftCards(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges { node { ${GC_FIELDS} } }
        }
      }`,
      { first: 50, query: search || null },
    );
    let cards = data.giftCards.edges.map(e => mapGiftCard(e.node));
    if (status) cards = cards.filter(c => c.status === status);
    res.json(cards);
  } catch (err) {
    console.error('Vouchers list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stats
router.get('/vouchers/stats', async (req, res) => {
  try {
    const data = await shopifyGQL(
      `query { giftCards(first: 250) { edges { node { ${GC_FIELDS} } } } }`,
    );
    const all = data.giftCards.edges.map(e => mapGiftCard(e.node));
    const active = all.filter(v => v.status === 'ACTIVE');
    res.json({
      total: all.length,
      active: active.length,
      exhausted: all.filter(v => v.status === 'EXHAUSTED').length,
      cancelled: all.filter(v => v.status === 'CANCELLED').length,
      activeBalance: active.reduce((s, v) => s + v.currentBalance, 0),
    });
  } catch (err) {
    console.error('Vouchers stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Issue
router.post('/vouchers', async (req, res) => {
  try {
    const { amount, customerName, customerEmail, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Importe inválido' });

    const displayNote = notes || `Vale POS MML${customerName ? ` - ${customerName}` : ''}`;
    const meta = {};
    if (customerName) meta.customerName = customerName;
    if (customerEmail) meta.customerEmail = customerEmail;
    const note = Object.keys(meta).length > 0
      ? buildNoteWithMeta(displayNote, meta)
      : displayNote;
    const data = await shopifyGQL(
      `mutation($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCard { ${GC_FIELDS} }
          giftCardCode
          userErrors { field message }
        }
      }`,
      { input: { initialValue: amount, note } },
    );
    if (data.giftCardCreate.userErrors?.length) {
      return res.status(400).json({ error: data.giftCardCreate.userErrors.map(e => e.message).join(', ') });
    }
    const card = mapGiftCard(data.giftCardCreate.giftCard);
    card.fullCode = data.giftCardCreate.giftCardCode;
    res.json(card);
  } catch (err) {
    console.error('Issue voucher error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lookup by last characters
router.get('/vouchers/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const data = await shopifyGQL(
      `query($q: String!) {
        giftCards(first: 5, query: $q) { edges { node { ${GC_FIELDS} } } }
      }`,
      { q: code },
    );
    const cards = data.giftCards.edges.map(e => mapGiftCard(e.node));
    const match = cards.find(c => c.lastCharacters === code || c.code.includes(code));
    if (!match) return res.status(404).json({ error: 'Vale no encontrado' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deactivate (cancel)
router.post('/vouchers/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    const gid = id.startsWith('gid://') ? id : `gid://shopify/GiftCard/${id}`;
    const data = await shopifyGQL(
      `mutation($id: ID!) {
        giftCardDeactivate(id: $id) {
          giftCard { ${GC_FIELDS} }
          userErrors { field message }
        }
      }`,
      { id: gid },
    );
    if (data.giftCardDeactivate.userErrors?.length) {
      return res.status(400).json({ error: data.giftCardDeactivate.userErrors.map(e => e.message).join(', ') });
    }
    res.json(mapGiftCard(data.giftCardDeactivate.giftCard));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
