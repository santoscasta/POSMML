import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { uuid, apiRoute, safeErrorCode, operationName, errorDetails, errorCategory } from '../../shared/diagnostics.js';

const context = new AsyncLocalStorage();
export function logEvent(event, details = {}, level = 'info') {
  try {
    const current = context.getStore();
    const record = { timestamp: new Date().toISOString(), level, event,
      ...(current ? { requestId: current.requestId, clientId: current.clientId } : {}), ...details };
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(record));
  } catch { /* Diagnostics must never change the outcome of a POS operation. */ }
}

export function logError(event, error) {
  try {
    const frames = typeof error?.stack === 'string' ? error.stack.split('\n').slice(1)
      .map(line => line.match(/server\/[A-Za-z0-9_./-]+\.js:\d+:\d+/)?.[0]).filter(Boolean).slice(0,5) : [];
    logEvent(event, { ...errorDetails(error), ...(frames.length ? { frames } : {}) }, 'error');
  } catch { logEvent(event, { errorType: 'Error', category: 'unknown' }, 'error'); }
}

export function requestDiagnostics({ slowMs = 10000 } = {}) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const requestId = uuid(req.get('X-Request-ID')) || randomUUID();
    const clientId = uuid(req.get('X-POS-Client-ID'));
    res.set('X-Request-ID', requestId);
    const started = performance.now();
    const info = () => ({ requestId, clientId, method: req.method, route: req.route?.path || apiRoute(req.path),
      ...(uuid(req.user?.id) ? { actorId: req.user.id } : {}),
      ...(uuid(req.body?.operationId) ? { operationId: req.body.operationId } : {}),
      ...(req.path.endsWith('/graphql') ? { operation: operationName(req.body?.query) } : {}) });
    context.run({ requestId, clientId }, () => {
      // Client diagnostic batches are logged as events, not another request.
      if (req.path === '/api/diagnostics/events') return next();
      logEvent('http.started', info());
      const waiting = setTimeout(() => logEvent('http.waiting', { ...info(), durationMs: Math.round(performance.now() - started) }, 'warn'), slowMs);
      waiting.unref?.();
      let errorCode, category;
      const json = res.json.bind(res);
      res.json = body => {
        errorCode = safeErrorCode(body?.code);
        if (typeof body?.error === 'string') category = errorCategory({ message: body.error, code: body.code });
        return json(body);
      };
      res.once('finish', () => {
        clearTimeout(waiting);
        logEvent('http.completed', { ...info(), status: res.statusCode, durationMs: Math.round(performance.now() - started), errorCode, category }, res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info');
      });
      res.once('close', () => {
        clearTimeout(waiting);
        if (!res.writableFinished) logEvent('http.disconnected', { ...info(), durationMs: Math.round(performance.now() - started) }, 'warn');
      });
      next();
    });
  };
}

export function observeShopifyResult(data, { operation, status, durationMs }) {
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  const userErrors = Object.values(data?.data || {}).flatMap(value => Array.isArray(value?.userErrors) ? value.userErrors : []);
  const failed = status >= 400 || errors.length || userErrors.length;
  logEvent(failed ? 'shopify.failed' : 'shopify.completed', {
    operation, status, durationMs, errorCount: errors.length, rejectionCount: userErrors.length,
    errorCodes: [...new Set(errors.map(e => safeErrorCode(e?.extensions?.code)).filter(Boolean))],
    categories: [...new Set([...errors, ...userErrors].map(errorCategory))],
  }, failed ? 'warn' : 'info');
}
