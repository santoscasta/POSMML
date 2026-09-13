import { useCallback, useEffect, useState } from 'react';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { buildCategoryTree, type CatalogCategory, type CategoryMetaobject } from '../utils/categoryTree';

const query = `query PosCategories($after: String) {
  metaobjects(type: "categoria", first: 100, after: $after) {
    nodes { id displayName fields { key value } }
    pageInfo { hasNextPage endCursor }
  }
}`;
interface Response {
  metaobjects: { nodes: CategoryMetaobject[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}
export function useCategories() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    async function fetchCategories() {
      setLoading(true);
      setError(null);
      try {
        let after: string | null = null;
        const objects: CategoryMetaobject[] = [];
        const cursors = new Set<string>();
        do {
          const data: Response = await shopifyGraphQL(query, { after });
          if (cancelled) return;
          objects.push(...data.metaobjects.nodes);
          if (!data.metaobjects.pageInfo.hasNextPage) break;
          after = data.metaobjects.pageInfo.endCursor;
          if (!after || cursors.has(after)) throw new Error('No se han podido cargar todas las categorías.');
          cursors.add(after);
        } while (!cancelled);
        setCategories(buildCategoryTree(objects));
      } catch (err) {
        if (!cancelled) {
          setCategories([]);
          setError(err instanceof Error ? err.message : 'Error al cargar las categorías');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchCategories();
    return () => { cancelled = true; };
  }, [attempt]);
  return { categories, loading, error, retry };
}
