import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createOperationStore, PosError } from "./operationStore.js";
import { businessDate } from "./businessTime.js";
import { normalizeSchedule, punchWindow } from "./attendanceSchedule.js";

const actions = {
  entry: ["out"],
  pause: ["working"],
  resume: ["paused"],
  exit: ["working", "paused"],
};
const states = {
  entry: "working",
  pause: "paused",
  resume: "working",
  exit: "out",
};
const publicEmployee = ({ id, name, role, active, schedule }) => ({
  id,
  name,
  role,
  active,
  ...(schedule ? { schedule } : {}),
});
const pinHash = (pin, salt) => scryptSync(pin, salt, 32);
function validatePin(pin) {
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin))
    throw new PosError("El PIN debe tener entre 4 y 8 cifras.");
}
function validateName(name) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
    throw new PosError("Indica un nombre de hasta 80 caracteres.");
  return name.trim();
}
function makeEmployee({ name, pin, role = "employee" }) {
  validatePin(pin);
  if (!["employee", "manager"].includes(role))
    throw new PosError("Permiso no válido.");
  const salt = randomBytes(16).toString("hex");
  return {
    id: randomUUID(),
    name: validateName(name),
    role,
    active: true,
    salt,
    pinHash: pinHash(pin, salt).toString("hex"),
  };
}

// Derive journeys from the original events; breaks are excluded from worked time.
export function attendanceJourneys(events, now) {
  const rows = [];
  const open = new Map();
  for (const event of events) {
    const at = Date.parse(event.at);
    if (event.action === "entry") {
      const row = {
        id: event.id,
        employeeId: event.employeeId,
        startedAt: event.at,
        endedAt: null,
        workedMs: 0,
        breakMs: 0,
        status: "working",
        events: [event],
        lastAt: at,
      };
      rows.push(row);
      open.set(event.employeeId, row);
      continue;
    }
    const row = open.get(event.employeeId);
    if (!row) continue;
    const elapsed = Math.max(0, at - row.lastAt);
    if (row.status === "working") row.workedMs += elapsed;
    else row.breakMs += elapsed;
    row.events.push(event);
    row.lastAt = at;
    row.status = states[event.action];
    if (event.action === "exit") {
      row.endedAt = event.at;
      open.delete(event.employeeId);
    }
  }
  return rows.map((row) => {
    if (!row.endedAt) {
      const elapsed = Math.max(0, now - row.lastAt);
      if (row.status === "working") row.workedMs += elapsed;
      else row.breakMs += elapsed;
    }
    const { lastAt: _lastAt, ...result } = row;
    return result;
  });
}

export function createAttendanceService(
  store,
  { now = () => Date.now() } = {},
) {
  const tokens = new Map();
  const read = () => {
    const data = store.read();
    data.employees ||= [];
    data.events ||= [];
    return data;
  };
  const change = (work) =>
    store.exclusive(() => {
      const data = read();
      const result = work(data);
      store.write(data);
      return result;
    });
  function windowFor(token, employee, action, at) {
    const window = punchWindow(employee.schedule, action, at);
    // Only the authenticated account's admin profile exempts time limits.
    // A legacy manager PIN or a client-supplied role cannot grant this exemption.
    const enforced = window.enabled && token?.user?.role !== "admin";
    return { ...window, enforced, allowed: !enforced || window.allowed };
  }
  function identify(token, manager = false, data = read()) {
    // The authenticated POS account is authoritative. PIN tokens cannot change its scope.
    if (token?.user) {
      const user = token.user;
      const linked = data.employees.find(
        (e) => e.id === user.employeeId && e.active,
      );
      if (user.role !== "admin" && !linked)
        throw new PosError(
          "Tu cuenta no tiene un empleado activo asociado. Contacta con el administrador.",
          403,
        );
      const employee = linked || {
        id: `account:${user.id}`,
        name: user.name,
        active: true,
      };
      const actor = {
        ...employee,
        role: user.role === "admin" ? "manager" : "employee",
      };
      if (manager && actor.role !== "manager")
        throw new PosError("Esta acción requiere un administrador.", 403);
      return actor;
    }
    const session = tokens.get(token);
    const employee =
      session &&
      session.expiresAt > now() &&
      data.employees.find((e) => e.id === session.id && e.active);
    if (!employee) {
      tokens.delete(token);
      throw new PosError(
        "Identifícate con tu PIN para continuar.",
        401,
        "ATTENDANCE_AUTH",
      );
    }
    if (manager && employee.role !== "manager")
      throw new PosError("Esta acción requiere un responsable.", 403);
    return employee;
  }
  function issue(employee) {
    for (const [key, session] of tokens)
      if (session.expiresAt <= now()) tokens.delete(key);
    const token = randomBytes(32).toString("hex");
    tokens.set(token, {
      id: employee.id,
      expiresAt: now() + 8 * 60 * 60 * 1000,
    });
    return { token, employee: publicEmployee(employee) };
  }
  return {
    employees() {
      return read()
        .employees.filter((e) => e.active)
        .map(publicEmployee);
    },
    employeesFor(user) {
      return read()
        .employees.filter(
          (e) =>
            e.active && (user.role === "admin" || e.id === user.employeeId),
        )
        .map(publicEmployee);
    },
    setup(input) {
      return change((data) => {
        if (data.employees.length)
          throw new PosError("El control horario ya está configurado.", 409);
        const employee = makeEmployee({ ...input, role: "manager" });
        data.employees.push(employee);
        return issue(employee);
      });
    },
    login({ employeeId, pin } = {}) {
      validatePin(pin);
      const employee = read().employees.find(
        (e) => e.id === employeeId && e.active,
      );
      const actual = pinHash(pin, employee?.salt || "invalid-employee");
      if (
        !employee ||
        !timingSafeEqual(actual, Buffer.from(employee.pinHash, "hex"))
      )
        throw new PosError("Nombre o PIN incorrectos.", 403);
      return issue(employee);
    },
    logout(token) {
      tokens.delete(token);
      return { ok: true };
    },
    addEmployee(token, input) {
      return change((data) => {
        identify(token, true, data);
        const employee = makeEmployee(input);
        data.employees.push(employee);
        return publicEmployee(employee);
      });
    },
    updateEmployee(token, id, input) {
      return change((data) => {
        const actor = identify(token, true, data);
        const employee = data.employees.find((e) => e.id === id);
        if (!employee) throw new PosError("Empleado no encontrado.", 404);
        if (input.active !== undefined) {
          if (typeof input.active !== "boolean")
            throw new PosError("Estado no válido.");
          if (actor.id === id && !input.active)
            throw new PosError("No puedes desactivar tu propio usuario.");
          const last = data.events.findLast((e) => e.employeeId === id);
          if (!input.active && last && last.action !== "exit")
            throw new PosError(
              "El empleado debe fichar su salida antes de desactivarlo.",
              409,
            );
          employee.active = input.active;
        }
        if (input.name !== undefined) employee.name = validateName(input.name);
        if (input.pin !== undefined) {
          validatePin(input.pin);
          employee.salt = randomBytes(16).toString("hex");
          employee.pinHash = pinHash(input.pin, employee.salt).toString("hex");
          for (const [key, session] of tokens)
            if (session.id === id) tokens.delete(key);
        }
        return publicEmployee(employee);
      });
    },
    setSchedule(token, id, input) {
      return change((data) => {
        const actor = identify(token, true, data);
        const employee = data.employees.find((e) => e.id === id);
        if (!employee) throw new PosError("Empleado no encontrado.", 404);
        const schedule = normalizeSchedule(input);
        const previous = employee.schedule || null;
        employee.schedule = schedule;
        data.scheduleChanges ||= [];
        data.scheduleChanges.push({
          id: randomUUID(),
          employeeId: id,
          previous,
          schedule,
          changedAt: new Date(now()).toISOString(),
          changedBy: {
            id: token?.user?.id || actor.id,
            name: token?.user?.name || actor.name,
          },
        });
        return publicEmployee(employee);
      });
    },
    punch(token, { action, requestId } = {}) {
      return change((data) => {
        const employee = identify(token, false, data);
        if (!data.employees.some((e) => e.id === employee.id && e.active))
          throw new PosError(
            "Vincula tu cuenta con un empleado en Ajustes → Usuarios para fichar.",
          );
        if (typeof action !== "string" || !Object.hasOwn(actions, action))
          throw new PosError("Fichaje no válido.");
        if (
          typeof requestId !== "string" ||
          !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)
        )
          throw new PosError("Identificador de fichaje requerido.");
        const existing = data.events.find((e) => e.requestId === requestId);
        if (existing) {
          if (existing.employeeId !== employee.id || existing.action !== action)
            throw new PosError("El intento corresponde a otro fichaje.", 409);
          return existing;
        }
        const last = data.events.findLast((e) => e.employeeId === employee.id);
        const status = last ? states[last.action] : "out";
        if (!actions[action].includes(status))
          throw new PosError(
            "Tu estado ha cambiado. Actualiza antes de volver a fichar.",
            409,
          );
        if (last && now() < Date.parse(last.at))
          throw new PosError(
            "La hora del servidor es anterior al último fichaje. Revisa el reloj.",
            409,
          );
        const at = now();
        const window = windowFor(token, employee, action, at);
        if (!window.allowed)
          throw new PosError(
            `${action === "entry" ? "Entrada" : "Salida"} bloqueada. Puedes fichar entre las ${window.min} y las ${window.max} (hora de Madrid). Contacta con el administrador si necesitas ajustar el horario.`,
            403,
            "OUTSIDE_SCHEDULE",
          );
        const event = {
          id: randomUUID(),
          requestId,
          employeeId: employee.id,
          action,
          at: new Date(at).toISOString(),
          ...(window.enabled
            ? {
                schedule: { ...employee.schedule },
                window: {
                  min: window.min,
                  max: window.max,
                  enforced: window.enforced,
                },
              }
            : {}),
        };
        data.events.push(event);
        return event;
      });
    },
    overview(token, { from = "", to = "", employeeId = "" } = {}) {
      const data = read();
      const actor = identify(token, false, data);
      for (const date of [from, to])
        if (
          date &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date)
        )
          throw new PosError("Fecha no válida.");
      if (from && to && from > to)
        throw new PosError("La fecha inicial debe ser anterior a la final.");
      const allowed = data.employees.filter(
        (e) => actor.role === "manager" || e.id === actor.id,
      );
      const employees = allowed.map((e) => {
        const last = data.events.findLast((event) => event.employeeId === e.id);
        return {
          ...publicEmployee(e),
          status: last ? states[last.action] : "out",
          lastAt: last?.at || null,
        };
      });
      const ids = new Set(employees.map((e) => e.id));
      const journeys = attendanceJourneys(
        data.events.filter((e) => ids.has(e.employeeId)),
        now(),
      )
        .filter(
          (row) =>
            (!employeeId || row.employeeId === employeeId) &&
            (!from || businessDate(row.startedAt) >= from) &&
            (!to || businessDate(row.startedAt) <= to),
        )
        .map((row) => ({
          ...row,
          employeeName: employees.find((e) => e.id === row.employeeId).name,
        }))
        .reverse();
      return {
        employee: publicEmployee(actor),
        punchWindows: {
          entry: windowFor(token, actor, "entry", now()),
          exit: windowFor(token, actor, "exit", now()),
        },
        employees,
        journeys,
        serverNow: new Date(now()).toISOString(),
      };
    },
  };
}

let singleton;
export function getAttendanceService() {
  singleton ||= createAttendanceService(
    createOperationStore(
      path.join(
        process.env.POS_DATA_DIR || path.resolve(".pos-data"),
        "attendance",
      ),
    ),
  );
  return singleton;
}
