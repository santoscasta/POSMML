import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { CUSTOMERS_SEARCH_QUERY } from '../graphql/customers';
import { matchesSearch } from '../utils/search';
import { nextCursor, queryPage } from '../utils/shopifyPagination';
import type { Connection } from '../utils/shopifyPagination';
import type { Customer } from '../types/customer';

interface CustomersResponse {
  customers: Connection<Customer>;
}

export function useCustomers() {
  const [catalog, setCatalog] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  const searchCustomers = useCallback((value: string) => {
    setQuery(value);
    if (value.trim()) setStarted(true);
  }, []);

  useEffect(() => {
    if (!started) return;
    const requests = requestId;
    const id = ++requests.current;
    const isCurrent = () => id === requests.current;
    async function load() {
      setLoading(true);
      setError(null);
      const collected = new Map<string, Customer>();
      const cursors = new Set<string>();
      let after: string | null = null;
      try {
        do {
          const data: CustomersResponse = await queryPage<CustomersResponse>(
            CUSTOMERS_SEARCH_QUERY, { first: 100, after }, isCurrent,
          );
          if (!isCurrent()) return;
          for (const { node } of data.customers.edges) collected.set(node.id, node);
          setCatalog([...collected.values()]);
          after = nextCursor(data.customers, cursors);
        } while (after && isCurrent());
      } catch (err) {
        if (isCurrent()) setError(err instanceof Error ? err.message : 'Error al buscar clientes');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }
    const timeout = setTimeout(() => { void load(); }, 300);
    return () => { ++requests.current; clearTimeout(timeout); };
  }, [started, attempt]);

  const customers = useMemo(() => query.trim()
    ? catalog.filter(customer => matchesSearch(customer, query)) : [], [catalog, query]);
  return { customers, loading: Boolean(query.trim()) && loading, error,
    searchCustomers, retry: () => { setLoading(true); setAttempt(value => value + 1); } };
}
