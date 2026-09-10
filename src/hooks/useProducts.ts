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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const requestId = useRef(0);

  const fetchProducts = useCallback(async (query: string, category: string | null) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setProducts([]);
    const queryParts = [];
    if (query) queryParts.push(query);
    if (category) queryParts.push(`product_type:${JSON.stringify(category)}`);
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
          collected.set(node.id, { ...node, variants: node.variants.edges.map(v => v.node) });
        }
        const fetched = [...collected.values()];
        setProducts(fetched);
        if (!category && !query) {
          setCategories(prev => [...new Set([...prev, ...fetched.map(p => p.productType).filter((type): type is string => !!type)])].sort());
        }
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
    const timeout = setTimeout(() => { void fetchProducts(searchQuery, categoryFilter); }, 300);
    return () => { ++requests.current; clearTimeout(timeout); };
  }, [searchQuery, categoryFilter, fetchProducts]);

  const retry = useCallback(() => { void fetchProducts(searchQuery, categoryFilter); }, [fetchProducts, searchQuery, categoryFilter]);
  return { products, loading, error, retry, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, categories };
}
