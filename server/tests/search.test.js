import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the same matcher used by all four frontend searches.
const source = await readFile(new URL('../../src/utils/search.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
const { matchesSearch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const voucher = {
  code: '****0253', customerName: 'Otra persona', customerEmail: null,
  notes: 'Recoger para María Lledó', status: 'ACTIVE', originalAmount: 21.5,
  issuedAt: '2026-11-06T12:00:00Z',
  transactions: [{ note: 'Cambio de chaqueta', orderName: '#15054', amount: 7 }],
};

test('voucher search finds a name that appears only in the note, ignoring case and accents', () => {
  assert.equal(matchesSearch(voucher, '  MARIA   lledo  '), true);
  assert.equal(matchesSearch({ ...voucher, customerName: null }, 'maría'), true);
  assert.equal(matchesSearch({ ...voucher, notes: null }, 'maría'), false);
});

test('search includes nested transactions and combines words from different fields', () => {
  for (const query of ['0253', 'chaqueta', '#15054', 'otra recoger', 'maria #15054']) {
    assert.equal(matchesSearch(voucher, query), true, query);
  }
  assert.equal(matchesSearch(voucher, 'maria inexistente'), false);
  assert.equal(matchesSearch({ notes: null }, 'notes'), false);
});

test('search accepts Spanish status labels, decimal commas and displayed dates', () => {
  for (const query of ['activo', '21,50', '21.50', '06/11/2026', '6/11/2026', '06 nov 2026']) {
    assert.equal(matchesSearch(voucher, query), true, query);
  }
  assert.equal(matchesSearch({ displayFinancialStatus: 'PARTIALLY_REFUNDED' }, 'parcialmente reembolsado'), true);
});

test('order, product and customer searches include notes, addresses, tags and variant data', () => {
  assert.equal(matchesSearch({ customer: { phone: '+34607140250' }, lineItems: [{ title: 'Abrigo lana', variant: { title: '6 años' } }] }, 'abrigo 6'), true);
  assert.equal(matchesSearch({ description: 'Algodón orgánico', variants: [{ sku: 'CHA-123', barcode: '8431234567', selectedOptions: [{ value: 'Azul' }] }] }, 'organico CHA-123 azul'), true);
  assert.equal(matchesSearch({ note: 'Llamar por la tarde', tags: ['Familia'], defaultAddress: { city: 'Málaga' }, phone: '+34607140250' }, 'familia malaga tarde 607140250'), true);
});

test('blank searches include records with empty or optional data', () => {
  for (const record of [null, {}, { notes: null }, voucher]) {
    assert.equal(matchesSearch(record, '   '), true);
  }
});
