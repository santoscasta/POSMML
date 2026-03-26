export interface DraftOrder {
  id: string;
  name: string;
  invoiceUrl: string;
  totalPrice: string;
  subtotalPrice: string;
  totalTax: string;
  status: string;
  createdAt: string;
}

export interface Order {
  id: string;
  name: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  createdAt: string;
  customer: { firstName: string; lastName: string } | null;
  lineItems: {
    title: string;
    quantity: number;
    originalTotalSet: { shopMoney: { amount: string; currencyCode: string } };
  }[];
}

export interface OrderLineItem {
  id: string;
  title: string;
  quantity: number;
  variant?: { id: string; title: string };
  originalTotalSet: { shopMoney: { amount: string; currencyCode: string } };
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
}

export interface OrderRefund {
  id: string;
  createdAt: string;
  note?: string;
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  refundLineItems: {
    edges: {
      node: {
        quantity: number;
        lineItem: { title: string };
        subtotalSet: { shopMoney: { amount: string; currencyCode: string } };
      };
    }[];
  };
}

export interface OrderDetail {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt?: string;
  note?: string;
  tags: string[];
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  subtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalTaxSet: { shopMoney: { amount: string; currencyCode: string } };
  totalDiscountsSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    address1: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  lineItems: { edges: { node: OrderLineItem }[] };
  refunds: OrderRefund[];
  transactions: {
    id: string;
    kind: string;
    status: string;
    amountSet: { shopMoney: { amount: string; currencyCode: string } };
  }[];
  metafields?: {
    edges: { node: { key: string; value: string } }[];
  };
}
