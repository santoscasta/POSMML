import { formatCurrency } from './currency';

export function voucherLabel(code?: string) {
  return code ? `Vale ${code.replace(/\s/g, '').slice(-4).toUpperCase()}` : 'Vale';
}

export function paymentAmounts(payments: { method: string; amount: number }[]) {
  const sum = (methods: string[]) => payments.filter(payment => methods.includes(payment.method))
    .reduce((total, payment) => total + Math.round(payment.amount * 100), 0) / 100;
  return { collected: sum(['CASH', 'CARD', 'BIZUM']), cash: sum(['CASH']), voucher: sum(['VOUCHER']) };
}

export function paymentMethodLabel(method: string) {
  return ({ CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum', VOUCHER: 'Vale', MIXED: 'Mixto', EXCHANGE: 'Cambio de artículos' } as Record<string, string>)[method] || method;
}

export function paymentSummary(payment: { method: string; mixedPayments?: { method: string; amount: number }[] }) {
  return payment.mixedPayments?.length
    ? payment.mixedPayments.map(split => `${paymentMethodLabel(split.method)} ${formatCurrency(split.amount)}`).join(' + ')
    : paymentMethodLabel(payment.method);
}
