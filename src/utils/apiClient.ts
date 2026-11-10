import { authHeaders, clearCredentials } from './auth';
import { tracedFetch, recordDiagnostic } from './diagnostics';
import { errorDetails } from '../../shared/diagnostics.js';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  code?: string;
  safeToRestart: boolean;
  requestId?: string;
  constructor(message: string, code?: string, safeToRestart = false, requestId?: string) {
    super(message);
    this.code = code;
    this.safeToRestart = safeToRestart;
    this.requestId = requestId;
  }
}

async function handleResponse<T>(res: Response, authorization?: string): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 && authorization === authHeaders().Authorization) clearCredentials();
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(error.error || error.message || 'Request failed', error.code, error.safeToRestart, res.headers.get('X-Request-ID') || undefined);
  }
  try { return await res.json(); }
  catch (error) { recordDiagnostic('api.failed', { requestId: res.headers.get('X-Request-ID') || undefined, ...errorDetails(error) }); throw error; }
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = authHeaders();
  const res = await tracedFetch(`${API_BASE}${path}`, { headers });
  return handleResponse<T>(res, headers.Authorization);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = authHeaders();
  const res = await tracedFetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res, headers.Authorization);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = authHeaders();
  const res = await tracedFetch(`${API_BASE}${path}`, { method: 'DELETE', headers });
  return handleResponse<T>(res, headers.Authorization);
}

export async function apiUploadImage<T>(path: string, file: File): Promise<T> {
  const headers = authHeaders();
  const res = await tracedFetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file,
  });
  return handleResponse<T>(res, headers.Authorization);
}
