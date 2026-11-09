import { Router } from 'express';
import { sanitizeClientEvent } from '../../shared/diagnostics.js';
import { logEvent } from '../lib/diagnostics.js';

export function createDiagnosticsRouter({ log = logEvent, now = Date.now } = {}) {
  const router = Router();
  const limits = new Map();
  router.post('/diagnostics/events', (req, res) => {
    // Keep this check even when mounted behind the application auth middleware.
    if (!req.user?.id) return res.sendStatus(401);
    const events = req.body?.events;
    if (!Array.isArray(events) || !events.length || events.length > 20) return res.sendStatus(400);
    const time = now();
    for (const [key, value] of limits) if (value.until <= time) limits.delete(key);
    const quota = limits.get(req.user.id) || { count: 0, until: time + 60000 };
    if (quota.count + events.length > 120) return res.status(429).set('Retry-After', String(Math.ceil((quota.until - time) / 1000))).end();
    quota.count += events.length;
    limits.set(req.user.id, quota);
    for (const input of events) {
      const event = sanitizeClientEvent(input, time);
      if (event) log(event.event, { origin: 'browser', ...event,
        // A batch's request ID is not the API request that the event describes.
        requestId: event.requestId, ingestRequestId: res.getHeader('X-Request-ID'),
        // Actor identity comes from the session, never the submitted batch.
        actorId: req.user.id,
      }, /error|failed|timeout|delay/.test(event.event) ? 'warn' : 'info');
    }
    res.sendStatus(204);
  });
  return router;
}
