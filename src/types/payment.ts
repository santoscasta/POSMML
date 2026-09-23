export type PaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'MIXED' | 'VOUCHER' | 'EXCHANGE';

export interface MixedPaymentSplit {
  method: Exclude<PaymentMethod, 'MIXED'>;
  amount: number;
  voucherCode?: string;
}

export interface PosPayment {
  id: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  exchangeId?: string;
  originalOrderName?: string;
  replacementOrderName?: string;
  exchangeReceipt?: import('../utils/exchangeReceipt').ExchangeReceiptData;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  changeGiven?: number;
  sessionId: string;
  type: 'sale' | 'refund' | 'exchange_return';
  notes?: string;
  createdAt: string;
  mixedPayments?: MixedPaymentSplit[];
  voucherCode?: string;
}

export interface PaymentInput {
  shopifyOrderId: string;
  shopifyOrderName: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  changeGiven?: number;
  type?: 'sale' | 'refund';
  notes?: string;
  mixedPayments?: MixedPaymentSplit[];
}
