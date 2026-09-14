import { Router } from 'express';
import shopifyGQL from '../lib/shopifyGQL.js';
import { getStore } from '../lib/operationStore.js';
import { issueVoucher, allGiftCards } from '../lib/voucherIssue.js';
import { sendVoucherEmail } from '../lib/voucherEmail.js';

const router = Router();

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
    const all = await allGiftCards(shopifyGQL, GC_FIELDS, 10, search || null);
    let cards = all.map(mapGiftCard);
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
    const cards = await allGiftCards(shopifyGQL, 'id balance { amount currencyCode } initialValue { amount currencyCode } enabled createdAt lastCharacters', 100);
    const all = cards.map(mapGiftCard);
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

router.post('/vouchers/send-email', async (req, res) => {
  try {
    res.json(await sendVoucherEmail(shopifyGQL, req.body));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Issue
router.post('/vouchers', async (req, res) => {
  try {
    const { operationId, ...input } = req.body;
    const result = await issueVoucher(shopifyGQL, getStore(), operationId, input, GC_FIELDS);
    res.json({ ...mapGiftCard(result.card), fullCode: result.fullCode });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code, safeToRestart: err.safeToRestart === true });
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
