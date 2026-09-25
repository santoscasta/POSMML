import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/saleReceipt.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { saleReceipt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const summaryBundle = await build({ entryPoints: ['src/utils/paymentDisplay.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { paymentSummary } = await import(`data:text/javascript;base64,${Buffer.from(summaryBundle.outputFiles[0].text).toString('base64')}`);

test('normal and gift receipts share contact details and conditions but gift has no amounts', () => {
  const data = { order: '#14975', date: '15/09/2026', method: 'Tarjeta',
    items: [{ title: 'Diadema <azul>', variantTitle: 'Default Title', quantity: 1, price: 13 }],
    subtotal: 13, total: 12, discountAmount: 1, taxAmount: 2.08, cashReceived: 20 };
  const normal = saleReceipt(data);
  const gift = saleReceipt(data, true);
  for (const html of [normal, gift]) {
    assert.match(html, /607140250/);
    assert.match(html, /Instagram: @myminileo/);
    assert.match(html, /plazo.*15 días/);
    assert.match(html, /Diadema &lt;azul&gt;/);
    assert.doesNotMatch(html, /facebook/i);
  }
  assert.match(normal, /TOTAL/);
  assert.match(normal, /€/);
  assert.doesNotMatch(gift, /€|Subtotal|Descuento|IVA|TOTAL|Recibido|Cambio<\/span>/);
});

test('voucher receipt shows the purchase, voucher debit and zero still to pay', () => {
  const data = { order: '#15027', date: '25/09/2026', method: 'Vale',
    items: [{ title: 'Cuerdecitas', variantTitle: 'Default Title', quantity: 2, price: 6 }],
    subtotal: 12, total: 12, discountAmount: 0, taxAmount: 2.08,
    payments: [{ method: 'VOUCHER', amount: 12 }] };
  const html = saleReceipt(data);
  assert.match(html, /Total compra<\/span><span>12,00/);
  assert.match(html, /Vale<\/span><span>-12,00/);
  assert.match(html, /TOTAL<\/span><span>0,00/);
  assert.doesNotMatch(saleReceipt(data, true), /12,00|TOTAL/);
});

test('mixed voucher receipt separates the voucher from cash', () => {
  const html = saleReceipt({ order: '#1', date: '25/09/2026', method: 'Mixto', items: [],
    subtotal: 12, total: 12, discountAmount: 0, taxAmount: 2.08,
    payments: [{ method: 'VOUCHER', amount: 8 }, { method: 'CASH', amount: 4 }] });
  assert.match(html, /Vale<\/span><span>-8,00/);
  assert.match(html, /Efectivo<\/span><span>-4,00/);
  assert.match(html, /TOTAL<\/span><span>0,00/);
});

test('cash register describes each tender instead of presenting a mixed sale as all cash', () => {
  assert.equal(paymentSummary({ method: 'MIXED', mixedPayments: [
    { method: 'VOUCHER', amount: 9.5 }, { method: 'CARD', amount: 2.5 },
  ] }), 'Vale 9,50 € + Tarjeta 2,50 €');
});
