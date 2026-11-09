import { useState, useEffect, useCallback, useRef } from 'react';
import { ORDERS_QUERY, ORDER_SEARCH_ITEMS_QUERY } from '../graphql/orders';
import { matchesSearch } from '../utils/search';
import { orderStatusLabel } from '../utils/orderStatus';
import { completeConnection, nextCursor, queryPage } from '../utils/shopifyPagination';
import type { Connection } from '../utils/shopifyPagination';
import type { Order, OrderSortKey } from '../types/order';
import { nextSort } from '../utils/sort';
import type { SortConfig } from '../utils/sort';

type OrderNode = Omit<Order, 'lineItems'> & {
  lineItems: Connection<Order['lineItems'][number]>;
};

interface OrdersResponse {
  orders: Connection<OrderNode>;
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [posOnly, setPosOnly] = useState(false);
  const [sort, setSort] = useState<SortConfig<OrderSortKey>>({ key: 'CREATED_AT', direction: 'desc' });
  const requestId = useRef(0);
  const busy = useRef(false);
  // Cache fetched pages for later searches while this list is open. Refresh clears it.
  const pages = useRef(new Map<string, OrdersResponse>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchOrders = useCallback(
    async (search: string, posFilter: boolean, after?: string | null) => {
      const id = ++requestId.current;
      busy.current = true;
      try {
        setLoading(true);
        setError(null);
        const isCurrent = () => id === requestId.current;
        const fetched: Order[] = [];
        const seen = new Set<string>();
        let cursor = after || null;
        let next: string | null = null;
        do {
          const key = `${sort.key}:${sort.direction}:${posFilter}:${cursor || ''}`;
          let data = pages.current.get(key);
          if (!data) {
            data = await queryPage<OrdersResponse>(ORDERS_QUERY, {
              first: 20, after: cursor,
              sortKey: sort.key, reverse: sort.direction === 'desc',
              ...(posFilter ? { query: 'tag:"POS MML"' } : {}),
            }, isCurrent);
            if (!isCurrent()) return;
            pages.current.set(key, data);
          }
          for (const { node } of data.orders.edges) {
            if (search.trim()) {
              node.lineItems = await completeConnection(node.lineItems, async after => {
                const result = await queryPage<{ order: { lineItems: OrderNode['lineItems'] } }>(
                  ORDER_SEARCH_ITEMS_QUERY, { id: node.id, after }, isCurrent,
                );
                return result.order.lineItems;
              }, isCurrent);
              if (!isCurrent()) return;
            }
            const order = { ...node, lineItems: node.lineItems.edges.map(e => e.node) };
            if (matchesSearch({ ...order, orderStatus: orderStatusLabel(order) }, search)) fetched.push(order);
          }
          next = nextCursor(data.orders, seen);
          cursor = next;
          // Skip pages without enough matches instead of showing a false empty result.
        } while (search.trim() && next && fetched.length < 20 && isCurrent());

        if (!isCurrent()) return;
        if (after) setOrders(prev => [...prev, ...fetched]);
        else setOrders(fetched);
        setHasNextPage(Boolean(next));
        setEndCursor(next);
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (id === requestId.current) { busy.current = false; setLoading(false); }
      }
    },
    [sort],
  );

  const changeSort = useCallback((key: OrderSortKey) => {
    setSort(current => nextSort(current, key, key === 'CREATED_AT' || key === 'PROCESSED_AT' ? 'desc' : 'asc'));
  }, []);

  useEffect(() => {
    const requests = requestId;
    ++requests.current;
    busy.current = true;
    setLoading(true);
    setOrders([]);
    setHasNextPage(false);
    setEndCursor(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders(searchQuery, posOnly);
    }, 300);
    return () => {
      ++requests.current;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, posOnly, fetchOrders]);

  const loadMore = useCallback(() => {
    if (!busy.current && hasNextPage && endCursor) {
      fetchOrders(searchQuery, posOnly, endCursor);
    }
  }, [hasNextPage, endCursor, searchQuery, posOnly, fetchOrders]);

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pages.current.clear();
    setOrders([]);
    setEndCursor(null);
    setHasNextPage(false);
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
    sort,
    changeSort,
  };
}
