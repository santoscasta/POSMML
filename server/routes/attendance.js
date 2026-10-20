import { Router } from "express";

export function createAttendanceRouter(service) {
  const router = Router();
  const attempts = new Map();
  const token = (req) => req.get("X-Attendance-Token");
  const handle = (work) => async (req, res) => {
    try {
      res.json(await work(req));
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ error: error.message, code: error.code });
    }
  };
  const limit = (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const value = attempts.get(key) || { count: 0, until: now + 60000 };
    value.count++;
    attempts.set(key, value);
    if (value.count > 10)
      return res
        .status(429)
        .json({
          error:
            "Demasiados intentos. Espera un minuto antes de volver a identificarte.",
        });
    next();
  };
  router.get(
    "/attendance/employees",
    handle(() => service.employees()),
  );
  router.post(
    "/attendance/setup",
    limit,
    handle((req) => service.setup(req.body)),
  );
  router.post(
    "/attendance/login",
    limit,
    handle((req) => service.login(req.body)),
  );
  router.post(
    "/attendance/logout",
    handle((req) => service.logout(token(req))),
  );
  router.get(
    "/attendance/overview",
    handle((req) => service.overview(token(req), req.query)),
  );
  router.post(
    "/attendance/employees",
    handle((req) => service.addEmployee(token(req), req.body)),
  );
  router.post(
    "/attendance/employees/:id",
    handle((req) =>
      service.updateEmployee(token(req), req.params.id, req.body),
    ),
  );
  router.post(
    "/attendance/events",
    handle((req) => service.punch(token(req), req.body)),
  );
  return router;
}
