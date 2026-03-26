import { useState, useCallback, useRef } from 'react';
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchCustomers = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setCustomers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await shopifyGraphQL<CustomersResponse>(CUSTOMERS_SEARCH_QUERY, {
          query,
        });
        setCustomers(data.customers.edges.map((e) => e.node));
      } catch {
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return { customers, loading, searchCustomers };
}
