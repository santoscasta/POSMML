// Only these fields may cross the diagnostic boundary. Never accept arbitrary
// messages, URLs, request bodies, GraphQL variables, headers or receipt HTML.
export const CLIENT_EVENTS = new Set([
  'ui.started', 'ui.navigation', 'ui.heartbeat', 'ui.visibility', 'ui.focus',
  'ui.online', 'ui.offline', 'ui.pagehide', 'ui.event_loop_delay',
  'ui.runtime_error', 'ui.unhandled_rejection', 'ui.react_error', 'ui.resource_error',
  'api.failed', 'api.slow', 'api.waiting', 'graphql.failed',
  'print.requested', 'print.ready', 'print.assets_ready', 'print.dialog_open',
  'print.dialog_closed', 'print.returned', 'print.error', 'print.window_closed',
  'print.open_timeout', 'print.monitor_expired',
]);
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
const token = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : undefined;
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TimeoutError', 'AbortError', 'PosError', 'ApiError', 'ShopifyGraphQLError']);
const errorCodes = new Set(['BUSY', 'PENDING', 'CONFLICT', 'RECONCILIATION_REQUIRED', 'RESTOCK_UNAVAILABLE', 'LEGACY_RECONCILIATION_REQUIRED', 'INVALID_REQUEST', 'SESSION_EXPIRED', 'PASSWORD_CHANGE_REQUIRED', 'THROTTLED', 'ACCESS_DENIED', 'INTERNAL_SERVER_ERROR', 'GRAPHQL_VALIDATION_FAILED', 'NETWORK_ERROR', 'TIMEOUT', 'UNKNOWN']);
const categories = new Set(['metaobject_definition_missing', 'throttled', 'access_denied', 'timeout', 'network', 'storage', 'validation', 'unknown']);
export const safeErrorCode = value => errorCodes.has(value) ? value : undefined;
export const operationName = query => typeof query === 'string' ? token(query.match(/\b(?:query|mutation)\s+([A-Za-z][A-Za-z0-9_]*)/)?.[1]) || 'anonymous' : 'anonymous';

export function errorCategory(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/no metaobject definition exists/i.test(message)) return 'metaobject_definition_missing';
  if (/throttl|too many requests/i.test(message)) return 'throttled';
  if (/access denied|not authorized|permission|no access token/i.test(message)) return 'access_denied';
  if (/timed? ?out|timeout/i.test(message) || error?.name === 'TimeoutError') return 'timeout';
  if (/fetch failed|failed to fetch|network|ECONN|ENOTFOUND/i.test(message)) return 'network';
  if (/ENOSPC|EACCES|EROFS|EIO|journal.lock/i.test(message)) return 'storage';
  if (error?.code === 'INVALID_REQUEST') return 'validation';
  return 'unknown';
}

export function screenName(path) {
  const value = typeof path === 'string' ? path.split(/[?#]/)[0] : '';
  if (['/', '/dashboard', '/orders', '/caja', '/vales', '/horario', '/mi-cuenta', '/correos'].includes(value)) return value;
  return value.startsWith('/ajustes') ? '/ajustes' : '/other';
}

export function apiRoute(path) {
  const value = typeof path === 'string' ? path.split(/[?#]/)[0].replace(/^\/api(?=\/)/, '') : '';
  const match = value.match(/^\/(auth|attendance|sessions|checkout|refunds|exchanges|payments|vouchers|operations|graphql|dashboard|mail|customers|send-receipt|status|access)(?:\/|$)/);
  // The API family is sufficient on the client. Express supplies its static
  // route template on the server, without customer/order IDs in the URL.
  return match ? `/${match[1]}` : '/other';
}

export function sourceLocation(value) {
  if (typeof value !== 'string') return undefined;
  return value.match(/\/(?:assets\/[A-Za-z0-9_.-]+\.js|src\/[A-Za-z0-9_./-]+\.[jt]sx?)(?::\d+){0,2}/)?.[0]?.slice(0,180);
}

export function errorDetails(error) {
  const frames = typeof error?.stack === 'string' ? error.stack.split('\n').slice(1).map(sourceLocation).filter(Boolean).slice(0,5) : [];
  return { errorType: errorTypes.has(error?.name) ? error.name : 'Error', category: errorCategory(error),
    ...(safeErrorCode(error?.code) ? { errorCode: safeErrorCode(error.code) } : {}),
    ...(frames.length ? { frames } : {}) };
}

export function sanitizeClientEvent(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || !CLIENT_EVENTS.has(input.event)) return null;
  const result = { event: input.event, screen: screenName(input.screen) };
  const time = Date.parse(input.clientTime);
  if (Number.isFinite(time) && time >= now - 86400000 && time <= now + 300000) result.clientTime = new Date(time).toISOString();
  for (const field of ['requestId', 'printId']) if (uuid(input[field])) result[field] = uuid(input[field]);
  for (const field of ['durationMs', 'status', 'count', 'line', 'column'])
    if (typeof input[field] === 'number' && Number.isFinite(input[field]) && input[field] >= 0) result[field] = Math.min(86400000, Math.round(input[field]));
  if (['visible', 'hidden'].includes(input.visibility)) result.visibility = input.visibility;
  if (typeof input.online === 'boolean') result.online = input.online;
  if (typeof input.build === 'string' && /^(?:development|index-[A-Za-z0-9_-]+\.js)$/.test(input.build)) result.build = input.build;
  if (['GET', 'POST', 'DELETE', 'PATCH', 'PUT'].includes(input.method)) result.method = input.method;
  if (input.route) result.route = apiRoute(input.route);
  if (token(input.operation)) result.operation = token(input.operation);
  if (errorTypes.has(input.errorType)) result.errorType = input.errorType;
  if (safeErrorCode(input.errorCode)) result.errorCode = safeErrorCode(input.errorCode);
  if (categories.has(input.category)) result.category = input.category;
  if (sourceLocation(input.source)) result.source = sourceLocation(input.source);
  if (Array.isArray(input.frames)) result.frames = input.frames.map(sourceLocation).filter(Boolean).slice(0,5);
  return result;
}
