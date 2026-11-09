import { authHeaders, clearCredentials } from './auth';
import { tracedFetch, recordDiagnostic } from './diagnostics';
import { operationName, errorDetails } from '../../shared/diagnostics.js';
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
  const headers = authHeaders();
  const operation = operationName(query);
  const response = await tracedFetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  }, operation);

  if (!response.ok) {
    if (response.status === 401 && headers.Authorization === authHeaders().Authorization) clearCredentials();
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  let json: GraphQLResponse<T>;
  try { json = await response.json(); }
  catch (error) { recordDiagnostic('graphql.failed', { operation, requestId: response.headers.get('X-Request-ID') || undefined, ...errorDetails(error) }); throw error; }

  if (json.errors && json.errors.length > 0) {
    recordDiagnostic('graphql.failed', { operation, status: response.status, count: json.errors.length, requestId: response.headers.get('X-Request-ID') || undefined });
    throw new ShopifyGraphQLError(json.errors);
  }

  return json.data;
}
