export type SessionStatus = 'OPEN' | 'CLOSED';

export interface CashSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  cashierName: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: SessionStatus;
  notes?: string;
}

export interface SessionKPIs {
  totalOrders: number;
  grossSales: number;
  cashSales: number;
  cardSales: number;
  bizumSales: number;
  voucherSales: number;
  refunds: number;
  expectedCash: number;
}

export interface OpenSessionInput {
  openingAmount: number;
  cashierName?: string;
  notes?: string;
  force?: boolean;
}

export interface CloseSessionInput {
  closingAmount: number;
  notes?: string;
  force?: boolean;
}
