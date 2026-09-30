import { useState, useCallback, useRef, useEffect } from 'react';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { CUSTOMERS_SEARCH_QUERY } from '../graphql/customers';
import type { Customer } from '../types/customer';

interface CustomersResponse {
  customers: {
    edges: { node: Customer }[];
  };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current++;
  }, []);

  const searchCustomers = useCallback((query: string) => {
    const requestId = ++requestIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const value = query.trim();
        const searchQueries = [value];
        if (value.includes('@')) {
          searchQueries.unshift(`email:${JSON.stringify(value)}`);
        } else {
          const nameParts = value.split(/\s+/).filter(Boolean);
          const nameQuery = nameParts.length > 1
            ? `first_name:${JSON.stringify(nameParts[0])} AND last_name:${JSON.stringify(nameParts.slice(1).join(' '))}`
            : `first_name:${JSON.stringify(value)} OR last_name:${JSON.stringify(value)}`;
          searchQueries.unshift(nameQuery);
        }
        const results = await Promise.allSettled(searchQueries.map(searchQuery =>
          shopifyGraphQL<CustomersResponse>(CUSTOMERS_SEARCH_QUERY, { query: searchQuery }),
        ));
        if (requestId !== requestIdRef.current) return;
        const uniqueCustomers = new Map<string, Customer>();
        for (const result of results) {
          if (result.status === 'fulfilled') {
            for (const edge of result.value.customers.edges) uniqueCustomers.set(edge.node.id, edge.node);
          }
        }
        setCustomers([...uniqueCustomers.values()]);
      } catch {
        if (requestId === requestIdRef.current) setCustomers([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
  }, []);

  return { customers, loading, searchCustomers };
}
