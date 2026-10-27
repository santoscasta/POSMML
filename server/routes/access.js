import { Router } from "express";
import { createAccessMiddleware, requireAdmin } from "../lib/access.js";

export function createAccessRouter(service) {
  const router = Router();
  const throttle = keyFor => {
    const attempts = new Map();
    return (req, res, next) => {
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const key = keyFor(req);
      const entry = attempts.get(key) || { count: 0, until: now + 60000 };
      entry.count++;
      attempts.set(key, entry);
      if (entry.count > 10) return res.status(429).set('Retry-After', String(Math.ceil((entry.until - now) / 1000))).json({ error: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.' });
      next();
    };
  };
  const handle = (work) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json(await work(req));
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ error: error.message, code: error.code });
    }
  };
  router.post(
    "/auth/login",
    throttle(req => req.ip),
    handle((req) => service.login(req.body)),
  );
  router.use("/auth", createAccessMiddleware(service, { allowPasswordChange: true }));
  router.post('/auth/password', throttle(req => req.user.id), handle(req => service.changePassword(req.accessToken, req.body)));
  router.post('/auth/users/:id/reset-password', requireAdmin, throttle(req => req.user.id), handle(req => service.resetPassword(req.accessToken, req.params.id, req.body)));
  router.get(
    "/auth/me",
    handle((req) => service.current(req.accessToken)),
  );
  router.post(
    "/auth/logout",
    handle((req) => service.logout(req.accessToken)),
  );
  router.get(
    "/auth/users",
    requireAdmin,
    handle((req) => service.users(req.accessToken)),
  );
  router.post(
    "/auth/users",
    requireAdmin,
    handle((req) => service.addUser(req.accessToken, req.body)),
  );
  router.post(
    "/auth/users/:id",
    requireAdmin,
    handle((req) =>
      service.updateUser(req.accessToken, req.params.id, req.body),
    ),
  );
  router.get(
    "/auth/sessions",
    requireAdmin,
    handle((req) => service.sessions(req.accessToken)),
  );
  router.post(
    "/auth/sessions/:id/revoke",
    requireAdmin,
    handle((req) => service.revoke(req.accessToken, req.params.id)),
  );
  return router;
}
