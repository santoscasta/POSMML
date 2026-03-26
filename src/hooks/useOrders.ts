import { useState, useEffect, useCallback, useRef } from 'react';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { ORDERS_QUERY } from '../graphql/orders';
import type { Order } from '../types/order';

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { firstName: string; lastName: string } | null;
  lineItems: {
    edges: {
      node: {
        title: string;
        quantity: number;
        originalTotalSet: { shopMoney: { amount: string; currencyCode: string } };
      };
    }[];
  };
}

interface OrdersResponse {
  orders: {
    edges: { cursor: string; node: OrderNode }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [posOnly, setPosOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchOrders = useCallback(
    async (search: string, posFilter: boolean, after?: string | null) => {
      try {
        setLoading(true);
        setError(null);
        const variables: Record<string, unknown> = { first: 20 };

        const queryParts: string[] = [];
        if (search) queryParts.push(search);
        if (posFilter) queryParts.push('tag:"POS MML"');
        if (queryParts.length > 0) variables.query = queryParts.join(' ');
        if (after) variables.after = after;

        const data = await shopifyGraphQL<OrdersResponse>(ORDERS_QUERY, variables);

        const fetched: Order[] = data.orders.edges.map((edge) => ({
          ...edge.node,
          lineItems: edge.node.lineItems.edges.map((e) => e.node),
        }));

        if (after) {
          setOrders((prev) => [...prev, ...fetched]);
        } else {
          setOrders(fetched);
        }
        setHasNextPage(data.orders.pageInfo.hasNextPage);
        setEndCursor(data.orders.pageInfo.endCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders(searchQuery, posOnly);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, posOnly, fetchOrders]);

  const loadMore = useCallback(() => {
    if (hasNextPage && endCursor) {
      fetchOrders(searchQuery, posOnly, endCursor);
    }
  }, [hasNextPage, endCursor, searchQuery, posOnly, fetchOrders]);

  const refresh = useCallback(() => {
    setEndCursor(null);
    fetchOrders(searchQuery, posOnly);
  }, [searchQuery, posOnly, fetchOrders]);

  return {
    orders,
    loading,
    error,
    hasNextPage,
    loadMore,
    refresh,
    searchQuery,
    setSearchQuery,
    posOnly,
    setPosOnly,
  };
}
