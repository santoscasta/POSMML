import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/saleReceipt.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { saleReceipt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

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
