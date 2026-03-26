import { useState, useEffect, useCallback, useRef } from 'react';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { PRODUCTS_QUERY } from '../graphql/products';
import type { Product, ProductVariant } from '../types/product';

interface ProductsResponse {
  products: {
    edges: {
      cursor: string;
      node: {
        id: string;
        title: string;
        featuredImage: { url: string; altText: string | null } | null;
        status: string;
        totalInventory: number;
        variants: {
          edges: { node: Omit<ProductVariant, 'image'> & { image?: { url: string; altText: string | null } | null } }[];
        };
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchProducts = useCallback(
    async (query: string, after?: string | null, category?: string | null) => {
      try {
        setLoading(true);
        setError(null);
        const variables: Record<string, unknown> = { first: 30 };
        const queryParts: string[] = [];
        if (query) queryParts.push(query);
        if (category) queryParts.push(`product_type:"${category}"`);
        if (queryParts.length > 0) variables.query = queryParts.join(' ');
        if (after) variables.after = after;

        const data = await shopifyGraphQL<ProductsResponse>(PRODUCTS_QUERY, variables);

        const fetched: Product[] = data.products.edges.map((edge) => ({
          ...edge.node,
          variants: edge.node.variants.edges.map((v) => v.node),
        }));

        if (after) {
          setProducts((prev) => [...prev, ...fetched]);
        } else {
          setProducts(fetched);
          // Extract unique categories from first fetch
          if (!category && !query) {
            const types = new Set<string>();
            fetched.forEach((p) => { if (p.productType) types.add(p.productType); });
            setCategories((prev) => {
              const merged = new Set([...prev, ...types]);
              return Array.from(merged).sort();
            });
          }
        }
        setHasNextPage(data.products.pageInfo.hasNextPage);
        setEndCursor(data.products.pageInfo.endCursor);
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
      fetchProducts(searchQuery, null, categoryFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, categoryFilter, fetchProducts]);

  const loadMore = useCallback(() => {
    if (hasNextPage && endCursor) {
      fetchProducts(searchQuery, endCursor, categoryFilter);
    }
  }, [hasNextPage, endCursor, searchQuery, categoryFilter, fetchProducts]);

  return { products, loading, error, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, categories, hasNextPage, loadMore };
}
