import { authHeaders } from './auth';
import { sanitizeClientEvent, errorDetails, screenName, apiRoute, uuid } from '../../shared/diagnostics.js';
import type { ClientEvent } from '../../shared/diagnostics.js';

const queue: ClientEvent[] = [];
let clientId: string;
let installed = false;
let sending = false;
let nextAttempt = 0;
let lastHeartbeat = 0;
let dropped = 0;
// Keep queued events with their access session. Uploading a previous user's
// events under the next account would give support a misleading actor ID.
let queueAuthorization: string | undefined;

export function diagnosticClientId(): string {
  if (!clientId) {
    try { clientId = uuid(sessionStorage.getItem('pos.diagnostic-client.v1')) || crypto.randomUUID(); sessionStorage.setItem('pos.diagnostic-client.v1', clientId); }
    catch { clientId = crypto.randomUUID(); }
  }
  return clientId;
}

function buildId() {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src || '';
  return src.match(/\/(index-[A-Za-z0-9_-]+\.js)(?:\?|$)/)?.[1] || 'development';
}

export function recordDiagnostic(event: string, fields: Omit<ClientEvent, 'event'> = {}) {
  try {
    const authorization = authHeaders().Authorization;
    if (authorization !== queueAuthorization) {
      queue.length = 0;
      dropped = 0;
      nextAttempt = 0;
      queueAuthorization = authorization;
    }
    const entry = sanitizeClientEvent({ ...fields, event, clientTime: new Date().toISOString(),
      screen: window.location.pathname, visibility: document.visibilityState,
      online: navigator.onLine, build: buildId() });
    if (!entry) return;
    if (queue.length >= 100) { queue.shift(); dropped++; }
    queue.push(entry);
  } catch { /* Logging must never interrupt checkout or printing. */ }
}

export function reportBrowserError(event: string, error: unknown) {
  try { recordDiagnostic(event, errorDetails(error)); }
  catch { recordDiagnostic(event, { errorType: 'Error', category: 'unknown' }); }
}

export async function flushDiagnostics(keepalive = false) {
  if (sending || !queue.length || Date.now() < nextAttempt || !navigator.onLine) return;
  const headers = authHeaders();
  if (!headers.Authorization) return;
  if (headers.Authorization !== queueAuthorization) { queue.length = 0; queueAuthorization = headers.Authorization; return; }
  sending = true;
  const batch = queue.splice(0,20);
  try {
    // Use native fetch, never tracedFetch: logging failures cannot recurse.
    const response = await fetch(`${import.meta.env?.VITE_API_URL || '/api'}/diagnostics/events`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-POS-Client-ID': diagnosticClientId() },
      body: JSON.stringify({ events: batch }), keepalive,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (headers.Authorization === queueAuthorization) {
        if (response.status !== 400 && response.status !== 413) queue.unshift(...batch);
        nextAttempt = Date.now() + 60000;
      }
    } else if (dropped) {
      recordDiagnostic('ui.heartbeat', { count: dropped });
      dropped = 0;
    }
  } catch {
    if (headers.Authorization === queueAuthorization) {
      queue.unshift(...batch);
      nextAttempt = Date.now() + 30000;
    }
  } finally {
    while (queue.length > 100) { queue.shift(); dropped++; }
    sending = false;
  }
}

export async function tracedFetch(url: string, options: RequestInit = {}, operation?: string): Promise<Response> {
  let requestId: string;
  let headers: Headers;
  try {
    requestId = crypto.randomUUID();
    headers = new Headers(options.headers);
    headers.set('X-Request-ID', requestId);
    headers.set('X-POS-Client-ID', diagnosticClientId());
  } catch { return fetch(url, options); }
  const started = performance.now();
  const fields = { requestId, method: options.method || 'GET', route: apiRoute(new URL(url, window.location.href).pathname), operation };
  const waiting = setTimeout(() => recordDiagnostic('api.waiting', { ...fields, durationMs: performance.now() - started }), 10000);
  try {
    const response = await fetch(url, { ...options, headers });
    const durationMs = performance.now() - started;
    const result = { ...fields, requestId: uuid(response.headers.get('X-Request-ID')) || requestId, durationMs, status: response.status };
    if (!response.ok) recordDiagnostic('api.failed', result);
    else if (durationMs > 3000) recordDiagnostic('api.slow', result);
    return response;
  } catch (error) {
    recordDiagnostic('api.failed', { ...fields, durationMs: performance.now() - started, ...errorDetails(error), errorCode: 'NETWORK_ERROR' });
    throw error;
  } finally { clearTimeout(waiting); }
}

export function installDiagnostics() {
  if (installed) return;
  installed = true;
  let lastTick = performance.now();
  let lastVisibility = document.visibilityState;
  recordDiagnostic('ui.started');
  window.addEventListener('error', event => {
    if (event instanceof ErrorEvent) {
      recordDiagnostic('ui.runtime_error', { ...errorDetails(event.error), source: event.filename, line: event.lineno, column: event.colno });
    } else recordDiagnostic('ui.resource_error');
    void flushDiagnostics();
  }, true);
  window.addEventListener('unhandledrejection', event => { reportBrowserError('ui.unhandled_rejection', event.reason); void flushDiagnostics(); });
  window.addEventListener('online', () => { recordDiagnostic('ui.online'); nextAttempt = 0; void flushDiagnostics(); });
  window.addEventListener('offline', () => recordDiagnostic('ui.offline'));
  window.addEventListener('focus', () => recordDiagnostic('ui.focus'));
  document.addEventListener('visibilitychange', () => {
    recordDiagnostic('ui.visibility');
    lastTick = performance.now();
    lastVisibility = document.visibilityState;
    void flushDiagnostics(true);
  });
  window.addEventListener('pagehide', () => { recordDiagnostic('ui.pagehide'); void flushDiagnostics(true); });
  setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === 'visible') {
      if (lastVisibility === 'visible' && now - lastTick > 6000) recordDiagnostic('ui.event_loop_delay', { durationMs: now - lastTick - 1000 });
      if (now - lastHeartbeat >= 30000) { recordDiagnostic('ui.heartbeat'); lastHeartbeat = now; }
    }
    lastTick = now;
    lastVisibility = document.visibilityState;
  }, 1000);
  setInterval(() => { void flushDiagnostics(); }, 5000);
}

export function recordNavigation(path: string) {
  recordDiagnostic('ui.navigation', { screen: screenName(path) });
}
