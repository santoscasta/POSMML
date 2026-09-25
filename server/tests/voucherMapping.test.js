import test from 'node:test';
import assert from 'node:assert/strict';
import { mapGiftCard } from '../routes/vouchers.js';

const base = {
  id: 'gift-1', lastCharacters: '0253', balance: { amount: '21.50', currencyCode: 'EUR' },
  initialValue: { amount: '21.50' }, enabled: true, createdAt: '2026-09-25T16:00:00Z',
  note: 'Vale POS MML - Celia Lledó Burdiel\n---POS_META---\n{"customerName":"Celia Lledó Burdiel","customerEmail":"celia@example.com"}',
};

test('an email-only Shopify customer keeps the voucher customer name in the list', () => {
  const mapped = mapGiftCard({ ...base, customer: { firstName: null, lastName: null, email: 'celia@example.com' } });
  assert.equal(mapped.customerName, 'Celia Lledó Burdiel');
  assert.equal(mapped.customerEmail, 'celia@example.com');
});

test('a named Shopify customer takes priority over voucher metadata', () => {
  const mapped = mapGiftCard({ ...base, customer: { firstName: 'María', lastName: 'García', email: 'maria@example.com' } });
  assert.equal(mapped.customerName, 'María García');
});
