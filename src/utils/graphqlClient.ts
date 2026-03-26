const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/graphql` : '/api/graphql';

interface GraphQLResponse<T> {
  data: T;
  errors?: { message: string; locations?: { line: number; column: number }[] }[];
}

export class ShopifyGraphQLError extends Error {
  errors: { message: string }[];

  constructor(errors: { message: string }[]) {
    super(errors.map((e) => e.message).join(', '));
    this.name = 'ShopifyGraphQLError';
    this.errors = errors;
  }
}

export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const json: GraphQLResponse<T> = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new ShopifyGraphQLError(json.errors);
  }

  return json.data;
}
