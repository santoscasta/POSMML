export type VoucherStatus = 'ACTIVE' | 'EXHAUSTED' | 'CANCELLED';

export interface Voucher {
  id: string;
  code: string;
  originalAmount: number;
  currentBalance: number;
  customerName?: string;
  customerEmail?: string;
  status: VoucherStatus;
  notes?: string;
  originOrderId?: string;
  issuedAt: string;
  cancelledAt?: string;
  transactions?: VoucherTransaction[];
}

export interface VoucherTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  currency?: string;
  note?: string;
  processedAt: string;
}

export interface IssueVoucherInput {
  amount: number;
  customerName?: string;
  customerEmail?: string;
  notes?: string;
  originOrderId?: string;
}
