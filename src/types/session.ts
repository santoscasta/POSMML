export type SessionStatus = 'OPEN' | 'CLOSED';

export interface CashSession {
  id: string;
  openedAt: string | null;
  closedAt?: string;
  cashierName: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: SessionStatus;
  notes?: string;
  accountingError?: string;
  kpis?: SessionKPIs;
  countedOrders?: { name: string; amount: number; method: string; createdAt: string; mixedPayments?: { method: string; amount: number }[] }[];
  unregisteredOrders?: { id: string; name: string; reason: string }[];
  refreshedAt?: string;
}

export interface SessionKPIs {
  totalOrders: number;
  grossSales: number;
  cashSales: number;
  cardSales: number;
  bizumSales: number;
  voucherSales: number;
  exchangeSales?: number;
  refunds: number;
  refundsCash: number;
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
