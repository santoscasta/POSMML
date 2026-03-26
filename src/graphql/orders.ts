export const CREATE_DRAFT_ORDER = `
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTax
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const COMPLETE_DRAFT_ORDER = `
  mutation CompleteDraftOrder($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder {
        id
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            firstName
            lastName
          }
          lineItems(first: 5) {
            edges {
              node {
                title
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const REFUND_CREATE = `
  mutation RefundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      refund { id }
      userErrors { field message }
    }
  }
`;

export const REFUND_CALCULATE = `
  query RefundCalculate($orderId: ID!, $refundLineItems: [RefundLineItemInput!], $shipping: ShippingRefundInput) {
    order(id: $orderId) {
      id
      suggestedRefund(refundLineItems: $refundLineItems, shipping: $shipping) {
        refundLineItems {
          lineItem { id }
          quantity
          subtotal
        }
        totalCartDiscountAmount
        subtotal
      }
    }
  }
`;

export const ORDER_MARK_AS_PAID = `
  mutation OrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id displayFinancialStatus }
      userErrors { field message }
    }
  }
`;

export const FULFILLMENT_ORDERS = `
  query FulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      fulfillmentOrders(first: 5) {
        edges {
          node {
            id
            status
            lineItems(first: 50) {
              edges {
                node {
                  id
                  remainingQuantity
                  lineItem { title }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const FULFILLMENT_CREATE = `
  mutation FulfillmentCreate($fulfillment: FulfillmentV2Input!) {
    fulfillmentCreateV2(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

export const ORDER_CANCEL = `
  mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock) {
      orderCancelUserErrors { field message }
    }
  }
`;

export const ORDER_DETAIL = `
  query OrderDetail($id: ID!) {
    order(id: $id) {
      id name createdAt cancelledAt note tags
      displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      customer { id firstName lastName email phone }
      shippingAddress { address1 city province country zip }
      lineItems(first: 50) {
        edges {
          node {
            id title quantity
            variant { id title }
            originalTotalSet { shopMoney { amount currencyCode } }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
      refunds {
        id createdAt
        note
        totalRefundedSet { shopMoney { amount currencyCode } }
        refundLineItems(first: 50) {
          edges {
            node {
              quantity
              lineItem { title }
              subtotalSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
      transactions(first: 20) {
        id kind status amountSet { shopMoney { amount currencyCode } }
      }
      metafields(first: 10, namespace: "pos_mml") {
        edges { node { key value } }
      }
    }
  }
`;
