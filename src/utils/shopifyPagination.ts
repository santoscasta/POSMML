import { shopifyGraphQL } from './graphqlClient';

export interface Connection<T> {
  edges: { node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export function nextCursor(page: Connection<unknown>, seen: Set<string>): string | null {
  if (!page.pageInfo.hasNextPage) return null;
  const cursor = page.pageInfo.endCursor;
  if (!cursor || seen.has(cursor)) throw new Error('No se ha podido completar la búsqueda. Reintenta la carga.');
  seen.add(cursor);
  return cursor;
}

export async function queryPage<T>(query: string, variables: Record<string, unknown>, isCurrent: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (!isCurrent()) throw new Error('Búsqueda cancelada');
    try {
      return await shopifyGraphQL<T>(query, variables);
    } catch (error) {
      if (attempt >= 4 || !isCurrent() || !(error instanceof Error) || !/throttl|429/i.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

export async function completeConnection<T>(
  initial: Connection<T>,
  fetchNext: (after: string) => Promise<Connection<T>>,
  isCurrent: () => boolean,
): Promise<Connection<T>> {
  const edges = [...initial.edges];
  const seen = new Set<string>();
  let page = initial;
  let after: string | null;
  while ((after = nextCursor(page, seen)) && isCurrent()) {
    page = await fetchNext(after);
    edges.push(...page.edges);
  }
  return { edges, pageInfo: page.pageInfo };
}
