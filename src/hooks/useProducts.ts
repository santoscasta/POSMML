import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PRODUCTS_QUERY, PRODUCT_SEARCH_VARIANTS_QUERY } from '../graphql/products';
import { matchesSearch } from '../utils/search';
import { completeConnection, nextCursor, queryPage } from '../utils/shopifyPagination';
import type { Connection } from '../utils/shopifyPagination';
import type { Product, ProductVariant } from '../types/product';

type ProductNode = Omit<Product, 'variants'> & {
  categoryMembership?: { value: string } | null;
  variants: Connection<ProductVariant>;
};

interface ProductsResponse {
  products: Connection<ProductNode>;
}

export function useProducts(showOutOfStock: boolean, includeInactive = false) {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const requestId = useRef(0);

  // Load once per stock filter. Text searches reuse the catalog, including fields
  // Shopify does not index, such as descriptions and variant options/prices.
  const fetchProducts = useCallback(async () => {
    const id = ++requestId.current;
    const isCurrent = () => id === requestId.current;
    setLoading(true);
    setError(null);
    setCatalog([]);
    let after: string | null = null;
    const cursors = new Set<string>();
    const collected = new Map<string, Product>();
    try {
      do {
        const data: ProductsResponse = await queryPage<ProductsResponse>(PRODUCTS_QUERY, {
          first: 30, after,
          query: includeInactive ? undefined : showOutOfStock ? 'status:active' : 'status:active inventory_total:>0',
        }, isCurrent);
        if (!isCurrent()) return;
        for (const { node } of data.products.edges) {
          if (!includeInactive && node.status !== 'ACTIVE') continue;
          const categoryIds: unknown = JSON.parse(node.categoryMembership?.value || '[]');
          if (!Array.isArray(categoryIds) || categoryIds.some(id => typeof id !== 'string')) throw new Error(`Categorías inválidas en ${node.title}`);
          const variants = await completeConnection(node.variants, async after => {
            const result = await queryPage<{ product: { variants: Connection<ProductVariant> } }>(
              PRODUCT_SEARCH_VARIANTS_QUERY, { id: node.id, after }, isCurrent,
            );
            return result.product.variants;
          }, isCurrent);
          if (!isCurrent()) return;
          collected.set(node.id, { ...node, categoryIds, variants: variants.edges.map(v => v.node) });
        }
        setCatalog([...collected.values()]);
        after = nextCursor(data.products, cursors);
      } while (after && isCurrent());
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Error al cargar el catálogo');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [showOutOfStock, includeInactive]);

  useEffect(() => {
    const requests = requestId;
    void fetchProducts();
    return () => { ++requests.current; };
  }, [fetchProducts]);

  const products = useMemo(() => catalog.filter(product => matchesSearch(product, searchQuery)), [catalog, searchQuery]);
  const updateProduct = useCallback((product: Product) => {
    setCatalog(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product]);
  }, []);
  return { products, loading, error, retry: fetchProducts, searchQuery, setSearchQuery, updateProduct };
}
