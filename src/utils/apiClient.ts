import { authHeaders, clearCredentials } from './auth';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  code?: string;
  safeToRestart: boolean;
  constructor(message: string, code?: string, safeToRestart = false) {
    super(message);
    this.code = code;
    this.safeToRestart = safeToRestart;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) clearCredentials();
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(error.error || error.message || 'Request failed', error.code, error.safeToRestart);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  return handleResponse<T>(res);
}
