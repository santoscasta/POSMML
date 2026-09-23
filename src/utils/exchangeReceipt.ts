import { escapeHtml, thermalStyles } from './print';
import { formatCurrency } from './currency';

export interface ExchangeReceiptData {
  originalOrderName: string;
  replacementOrderName: string;
  createdAt: string;
  customer?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null;
  returnedItems: { lineItemId?: string; title: string; variantTitle?: string; quantity: number; amount: number }[];
  replacementItems: { title: string; variantTitle?: string; quantity: number; price: number }[];
  credit: number;
  total: number;
  due: number;
  paymentMethod?: string;
  cashReceived?: number;
  change?: number;
  voucher?: { code: string; amount: number };
}

const row = (label: string, value: string) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
const itemName = (item: { title: string; variantTitle?: string }) =>
  `${escapeHtml(item.title)}${item.variantTitle && item.variantTitle !== 'Default Title' ? ` (${escapeHtml(item.variantTitle)})` : ''}`;
const methodNames: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum' };

export function exchangeReceipt(data: ExchangeReceiptData) {
  const customerName = data.customer
    ? `${data.customer.firstName || ''} ${data.customer.lastName || ''}`.trim()
    : '';
  return `<!DOCTYPE html><html lang="es"><head><title>Ticket de cambio ${escapeHtml(data.replacementOrderName)}</title>
    <style>${thermalStyles}</style></head><body>
    <div class="center"><img class="receipt-logo" src="/logo-myminileo.jpg" alt="My mini Leo" /></div>
    <div class="line"></div>
    <div>Calle Asunción 38A<br/>41011 Sevilla<br/>España<br/>Teléfono: 607140250<br/>Instagram: @myminileo</div>
    <div class="line"></div>
    <div class="center brand">TICKET DE CAMBIO</div>
    ${row('Pedido original:', escapeHtml(data.originalOrderName))}
    ${row('Nuevo pedido:', escapeHtml(data.replacementOrderName))}
    ${row('Fecha:', escapeHtml(new Date(data.createdAt).toLocaleString('es-ES')))}
    ${customerName ? row('Cliente:', escapeHtml(customerName)) : ''}
    <div class="line"></div>
    <div class="bold">ARTÍCULOS DEVUELTOS</div>
    ${data.returnedItems.map(item => `<div class="item">${row(`${item.quantity}x ${itemName(item)}`, formatCurrency(item.amount))}</div>`).join('')}
    ${row('Valor de la devolución', formatCurrency(data.credit))}
    <div class="line"></div>
    <div class="bold">ARTÍCULOS ENTREGADOS</div>
    ${data.replacementItems.map(item => `<div class="item">${row(`${item.quantity}x ${itemName(item)}`, formatCurrency(item.price * item.quantity))}</div>`).join('')}
    ${row('Total nuevos artículos', formatCurrency(data.total))}
    <div class="line"></div>
    ${data.due > 0 ? `<div class="total">${row('DIFERENCIA PAGADA', formatCurrency(data.due))}</div>
      ${row('Método', escapeHtml(methodNames[data.paymentMethod || ''] || data.paymentMethod || ''))}
      ${data.paymentMethod === 'CASH' && data.cashReceived != null ? `${row('Recibido', formatCurrency(data.cashReceived))}${row('Cambio', formatCurrency(data.change || 0))}` : ''}`
      : data.voucher ? `<div class="total">${row('VALE GENERADO', formatCurrency(data.voucher.amount))}</div><div class="center code">${escapeHtml(data.voucher.code)}</div>`
      : '<div class="center bold">CAMBIO SIN DIFERENCIA</div>'}
    <div class="line"></div>
    <div class="footer">El plazo para realizar cualquier cambio es de 15 días, podrá ser por otra prenda o un vale. Las prendas han de estar en perfectas condiciones y debidamente etiquetadas. Las prendas de outlet no podrán ser cambiadas ni se devolverá el dinero. Los chupetes, mordedores, chupeteros, botellas y cajitas no tendrán posibilidad de cambio por higiene.</div>
    <div class="footer">Gracias por su compra<br/>myminileo.com</div>
    </body></html>`;
}

export function exchangeVoucherReceipt(data: ExchangeReceiptData) {
  if (!data.voucher) return '';
  const customerName = data.customer
    ? `${data.customer.firstName || ''} ${data.customer.lastName || ''}`.trim()
    : '';
  return `<!DOCTYPE html><html lang="es"><head><title>Vale de cambio</title><style>${thermalStyles}</style></head><body>
    <div class="center"><img class="receipt-logo" src="/logo-myminileo.jpg" alt="My mini Leo" /></div>
    <div class="center brand">VALE DE CAMBIO</div><div class="line"></div>
    <div class="center code">${escapeHtml(data.voucher.code)}</div>
    <div class="center total">${formatCurrency(data.voucher.amount)}</div>
    ${customerName ? row('Cliente:', escapeHtml(customerName)) : ''}
    ${data.customer?.email ? row('Email:', escapeHtml(data.customer.email)) : ''}
    ${data.customer?.phone ? row('Teléfono:', escapeHtml(data.customer.phone)) : ''}
    ${row('Pedido original:', escapeHtml(data.originalOrderName))}
    ${row('Nuevo pedido:', escapeHtml(data.replacementOrderName))}
    ${row('Fecha:', escapeHtml(new Date(data.createdAt).toLocaleString('es-ES')))}
    <div class="line"></div><div class="footer">Presente este vale para canjearlo en tienda.<br/>myminileo.com</div>
    </body></html>`;
}
