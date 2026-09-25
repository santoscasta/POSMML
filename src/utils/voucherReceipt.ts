import { formatCurrency } from './currency';
import { escapeHtml, thermalStyles } from './print';
import { receiptFooter, receiptHeader } from './receiptBranding';

interface VoucherReceiptData {
  code: string;
  amount: number;
  date: string;
  title?: string;
  customerName?: string;
  orderName?: string;
  balance?: number;
  partialCode?: boolean;
  currencyCode?: string;
}

export function voucherReceipt(data: VoucherReceiptData) {
  const row = (label: string, value: string) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(data.title || 'Vale')} My mini Leo</title><style>${thermalStyles}</style></head><body>
    ${receiptHeader}
    <h1 class="center brand">${escapeHtml(data.title || 'VALE')}</h1>
    ${data.partialCode ? '<p class="center">El código completo está en el correo o en el vale original.</p>' : ''}
    <p class="center code">${escapeHtml(data.code)}</p>
    <p class="center total">${formatCurrency(data.amount, data.currencyCode)}</p>
    ${data.balance != null && data.balance !== data.amount ? row('Saldo disponible:', formatCurrency(data.balance, data.currencyCode)) : ''}
    ${data.customerName ? row('Cliente:', escapeHtml(data.customerName)) : ''}
    ${data.orderName ? row('Pedido original:', escapeHtml(data.orderName)) : ''}
    ${row('Emitido:', escapeHtml(data.date))}
    <div class="line"></div>
    <div class="footer">${data.partialCode ? 'Consulta el código completo para utilizar tu vale.' : 'Presenta este código para utilizar tu vale.'}</div>
    ${receiptFooter}
  </body></html>`;
}
