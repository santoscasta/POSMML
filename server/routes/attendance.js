import { Router } from "express";
import { randomInt } from "node:crypto";

export function createAttendanceRouter(service) {
  const router = Router();
  const attempts = new Map();
  const token = (req) =>
    req.user ? { user: req.user } : req.get("X-Attendance-Token");
  const employeeInput = (req) =>
    req.user
      ? {
          ...req.body,
          pin: String(randomInt(10000000, 100000000)),
          role: "employee",
        }
      : req.body;
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
      return res.status(429).json({
        error:
          "Demasiados intentos. Espera un minuto antes de volver a identificarte.",
      });
    next();
  };
  router.get(
    "/attendance/employees",
    handle((req) =>
      req.user ? service.employeesFor(req.user) : service.employees(),
    ),
  );
  router.post(
    "/attendance/setup",
    limit,
    handle((req) => {
      if (req.user?.role !== undefined && req.user.role !== "admin") {
        const error = new Error("Esta acción requiere un administrador.");
        error.status = 403;
        throw error;
      }
      return service.setup(employeeInput(req));
    }),
  );
  router.post(
    "/attendance/login",
    limit,
    handle((req) => {
      if (req.user) {
        const error = new Error(
          "Usa tu cuenta de acceso al TPV para identificarte.",
        );
        error.status = 403;
        throw error;
      }
      return service.login(req.body);
    }),
  );
  router.post(
    "/attendance/logout",
    handle((req) => {
      if (req.user) {
        const error = new Error("Usa Salir para cerrar tu sesión de acceso.");
        error.status = 403;
        throw error;
      }
      return service.logout(token(req));
    }),
  );
  router.get(
    "/attendance/overview",
    handle((req) => service.overview(token(req), req.query)),
  );
  router.post(
    "/attendance/employees",
    handle((req) => service.addEmployee(token(req), employeeInput(req))),
  );
  router.post(
    "/attendance/employees/:id/schedule",
    handle((req) => service.setSchedule(token(req), req.params.id, req.body)),
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
