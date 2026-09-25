import { escapeHtml, thermalStyles } from './print';
import { formatCurrency } from './currency';
import { receiptFooter, receiptHeader } from './receiptBranding';
import type { PaymentMethod } from '../types/payment';

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
  payments?: { method: PaymentMethod; amount: number }[];
}

export function saleReceipt(data: ReceiptData, gift = false) {
  const row = (label: string, value: string) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  const voucherPaid = data.payments?.some(payment => payment.method === 'VOUCHER') ?? false;
  const paymentNames: Record<string, string> = { VOUCHER: 'Vale', CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum' };
  const paidCents = voucherPaid ? data.payments!.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) : 0;
  const remaining = (Math.round(data.total * 100) - paidCents) / 100;
  return `<!DOCTYPE html><html lang="es"><head><title>Ticket${gift ? ' regalo' : ''} ${escapeHtml(data.order)}</title>
    <style>${thermalStyles}</style></head><body>
    ${receiptHeader}
    ${row('Ticket:', escapeHtml(data.order))}
    ${row('Fecha:', escapeHtml(data.date))}
    ${row('Método:', escapeHtml(data.method))}
    <div class="line"></div>
    ${data.items.map(i => `<div class="item">${row(`${i.quantity}x ${escapeHtml(i.title)}${i.variantTitle && i.variantTitle !== 'Default Title' ? ` (${escapeHtml(i.variantTitle)})` : ''}`, gift ? '' : formatCurrency(i.price * i.quantity))}</div>`).join('')}
    <div class="line"></div>
    ${gift ? '' : `${row('Subtotal', formatCurrency(data.subtotal))}
      ${data.discountAmount > 0 ? row('Descuento', `-${formatCurrency(data.discountAmount)}`) : ''}
      ${row('IVA (incluido)', formatCurrency(data.taxAmount))}
      ${voucherPaid ? `${row('Total compra', formatCurrency(data.total))}
        ${data.payments!.map(payment => row(paymentNames[payment.method] || payment.method, `-${formatCurrency(payment.amount)}`)).join('')}
        <div class="total">${row('TOTAL', formatCurrency(remaining))}</div>`
        : `<div class="total">${row('TOTAL', formatCurrency(data.total))}</div>`}
      ${data.cashReceived ? `${row('Recibido', formatCurrency(data.cashReceived))}${row('Cambio', formatCurrency(data.cashReceived - data.total))}` : ''}
      <div class="line"></div>`}
    ${receiptFooter}
    </body></html>`;
}
