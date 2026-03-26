export type PaymentMethod = 'CASH' | 'CARD' | 'BIZUM' | 'MIXED' | 'VOUCHER';

export interface MixedPaymentSplit {
  method: Exclude<PaymentMethod, 'MIXED'>;
  amount: number;
}

export interface PosPayment {
  id: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  changeGiven?: number;
  sessionId: string;
  type: 'sale' | 'refund';
  notes?: string;
  createdAt: string;
  mixedPayments?: MixedPaymentSplit[];
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
