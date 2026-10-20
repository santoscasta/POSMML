import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createOperationStore, PosError } from "./operationStore.js";
import { businessDate } from "./businessTime.js";

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
const publicEmployee = ({ id, name, role, active }) => ({
  id,
  name,
  role,
  active,
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
  function identify(token, manager = false, data = read()) {
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
    punch(token, { action, requestId } = {}) {
      return change((data) => {
        const employee = identify(token, false, data);
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
        const event = {
          id: randomUUID(),
          requestId,
          employeeId: employee.id,
          action,
          at: new Date(now()).toISOString(),
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
