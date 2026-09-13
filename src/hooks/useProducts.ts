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
        productType: string;
        categoryMembership?: { value: string } | null;
        totalInventory: number;
        variants: {
          edges: { node: Omit<ProductVariant, 'image'> & { image?: { url: string; altText: string | null } | null } }[];
        };
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export function useProducts(showOutOfStock: boolean) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const requestId = useRef(0);

  const fetchProducts = useCallback(async (query: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setProducts([]);
    const queryParts = [];
    if (query) queryParts.push(`(${query})`);
    if (!showOutOfStock) queryParts.push('inventory_total:>0');
    let after: string | null = null;
    const cursors = new Set<string>();
    const collected = new Map<string, Product>();
    try {
      do {
        let data: ProductsResponse;
        for (let attempt = 0; ; attempt++) {
          try {
            data = await shopifyGraphQL<ProductsResponse>(PRODUCTS_QUERY, {
              first: 30, after, ...(queryParts.length ? { query: queryParts.join(' ') } : {}),
            });
            break;
          } catch (err) {
            if (id !== requestId.current) return;
            if (attempt >= 4 || !(err instanceof Error) || !/throttl|429/i.test(err.message)) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
            if (id !== requestId.current) return;
          }
        }
        if (id !== requestId.current) return;
        for (const { node } of data.products.edges) {
          const categoryIds: unknown = JSON.parse(node.categoryMembership?.value || '[]');
          if (!Array.isArray(categoryIds) || categoryIds.some(id => typeof id !== 'string')) throw new Error(`Categorías inválidas en ${node.title}`);
          collected.set(node.id, { ...node, categoryIds, variants: node.variants.edges.map(v => v.node) });
        }
        const fetched = [...collected.values()];
        setProducts(fetched);
        if (!data.products.pageInfo.hasNextPage) break;
        after = data.products.pageInfo.endCursor;
        if (!after || cursors.has(after)) throw new Error('No se ha podido completar el catálogo. Reintenta la carga.');
        cursors.add(after);
      } while (id === requestId.current);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Error al cargar el catálogo');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [showOutOfStock]);

  useEffect(() => {
    const requests = requestId;
    setProducts([]);
    setLoading(true);
    const timeout = setTimeout(() => { void fetchProducts(searchQuery); }, 300);
    return () => { ++requests.current; clearTimeout(timeout); };
  }, [searchQuery, fetchProducts]);

  const retry = useCallback(() => { void fetchProducts(searchQuery); }, [fetchProducts, searchQuery]);
  return { products, loading, error, retry, searchQuery, setSearchQuery };
}
