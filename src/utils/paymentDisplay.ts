import { formatCurrency } from './currency';

export function paymentMethodLabel(method: string) {
  return ({ CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum', VOUCHER: 'Vale', MIXED: 'Mixto', EXCHANGE: 'Cambio de artículos' } as Record<string, string>)[method] || method;
}

export function paymentSummary(payment: { method: string; mixedPayments?: { method: string; amount: number }[] }) {
  return payment.mixedPayments?.length
    ? payment.mixedPayments.map(split => `${paymentMethodLabel(split.method)} ${formatCurrency(split.amount)}`).join(' + ')
    : paymentMethodLabel(payment.method);
}
