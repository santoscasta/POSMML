import { escapeHtml, thermalStyles } from './print';
import { formatCurrency } from './currency';

interface ReceiptData {
  order: string;
  date: string;
  method: string;
  items: { title: string; variantTitle: string; quantity: number; price: number }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  cashReceived?: number;
}

export function saleReceipt(data: ReceiptData, gift = false) {
  const row = (label: string, value: string) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  return `<!DOCTYPE html><html lang="es"><head><title>Ticket${gift ? ' regalo' : ''} ${escapeHtml(data.order)}</title>
    <style>${thermalStyles}</style></head><body>
    <div class="center brand">My mini Leo</div>
    <div class="center">Clothes for your baby</div>
    <div class="line"></div>
    <div>Calle Asunción 38A<br/>41011 Sevilla<br/>España<br/>Teléfono: 607140250<br/>Instagram: @myminileo</div>
    <div class="line"></div>
    ${row('Ticket:', escapeHtml(data.order))}
    ${row('Fecha:', escapeHtml(data.date))}
    ${row('Método:', escapeHtml(data.method))}
    <div class="line"></div>
    ${data.items.map(i => `<div class="item">${row(`${i.quantity}x ${escapeHtml(i.title)}${i.variantTitle && i.variantTitle !== 'Default Title' ? ` (${escapeHtml(i.variantTitle)})` : ''}`, gift ? '' : formatCurrency(i.price * i.quantity))}</div>`).join('')}
    <div class="line"></div>
    ${gift ? '' : `${row('Subtotal', formatCurrency(data.subtotal))}
      ${data.discountAmount > 0 ? row('Descuento', `-${formatCurrency(data.discountAmount)}`) : ''}
      ${row('IVA (incluido)', formatCurrency(data.taxAmount))}
      <div class="total">${row('TOTAL', formatCurrency(data.total))}</div>
      ${data.cashReceived ? `${row('Recibido', formatCurrency(data.cashReceived))}${row('Cambio', formatCurrency(data.cashReceived - data.total))}` : ''}
      <div class="line"></div>`}
    <div class="footer">El plazo para realizar cualquier cambio es de 15 días, podrá ser por otra prenda o un vale. Las prendas han de estar en perfectas condiciones y debidamente etiquetadas. Las prendas de outlet no podrán ser cambiadas ni se devolverá el dinero. Los chupetes, mordedores, chupeteros, botellas y cajitas no tendrán posibilidad de cambio por higiene. Todas nuestras prendas deben lavarse en frío y programa delicado.</div>
    <div class="footer">Gracias por su compra<br/>myminileo.com</div>
    </body></html>`;
}
