import path from "node:path";
import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { PosError } from "./operationStore.js";
import { validateNewPassword } from "./passwordPolicy.js";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const publicUser = ({ id, username, name, role, active, employeeId, mustChangePassword, temporaryPasswordExpiresAt }) => ({
  id,
  username,
  name,
  role,
  active,
  employeeId,
  mustChangePassword: Boolean(mustChangePassword),
  temporaryPasswordExpiresAt: temporaryPasswordExpiresAt || null,
});
const roles = ["admin", "collaborator"];
function usernameOf(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,60}$/.test(value))
    throw new PosError(
      "Usa entre 2 y 60 letras, números, puntos o guiones como usuario.",
    );
  return value.toLowerCase();
}
function credentials(password) {
  if (
    typeof password !== "string" ||
    Array.from(password).length < 8 ||
    Array.from(password).length > 128
  )
    throw new PosError("La contraseña debe tener entre 8 y 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return { salt, passwordHash: scryptSync(password, salt, 32).toString("hex") };
}
function matchesPassword(password, user) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const actual = scryptSync(password, user?.salt || 'invalid-user', 32);
  return Boolean(user && timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex')));
}
function nameOf(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new PosError("Indica un nombre de hasta 80 caracteres.");
  return value.trim();
}

export function createAccessService(
  store,
  {
    now = () => Date.now(),
    sessionMs = 8 * 60 * 60 * 1000,
    employeeExists = () => false,
  } = {},
) {
  const read = () => {
    const data = store.read();
    data.users ||= [];
    data.sessions ||= [];
    return data;
  };
  const change = (work) =>
    store.exclusive(() => {
      const data = read();
      const result = work(data);
      store.write(data);
      return result;
    });
  function identify(token, data = read()) {
    const session =
      typeof token === "string" &&
      token.length >= 40 &&
      data.sessions.find((s) => s.tokenHash === hashToken(token));
    const user =
      session &&
      !session.revokedAt &&
      Date.parse(session.expiresAt) > now() &&
      data.users.find((u) => u.id === session.userId && u.active);
    if (!user)
      throw new PosError(
        "La sesión ha terminado. Vuelve a iniciar sesión.",
        401,
        "SESSION_EXPIRED",
      );
    return { user, session };
  }
  function admin(token, data) {
    const actor = identify(token, data);
    if (actor.user.mustChangePassword)
      throw new PosError('Cambia tu contraseña antes de continuar.', 403, 'PASSWORD_CHANGE_REQUIRED');
    if (actor.user.role !== "admin")
      throw new PosError("Esta acción requiere un administrador.", 403);
    return actor;
  }
  function add(data, input, bootstrap = false) {
    const username = usernameOf(input.username);
    if (data.users.some((u) => u.username === username))
      throw new PosError("Este nombre de usuario ya existe.", 409);
    if (!roles.includes(input.role)) throw new PosError("Perfil no válido.");
    if (!bootstrap) validateNewPassword(input.password, username);
    const employeeId = input.employeeId || null;
    if (employeeId && !employeeExists(employeeId))
      throw new PosError("Selecciona un empleado activo.");
    if (input.role === "collaborator" && !employeeId)
      throw new PosError(
        "Vincula el colaborador con su empleado para registrar sus fichajes.",
      );
    if (employeeId && data.users.some((u) => u.employeeId === employeeId))
      throw new PosError("Este empleado ya tiene una cuenta de acceso.", 409);
    const user = {
      id: randomUUID(),
      username,
      name: nameOf(input.name),
      role: input.role,
      active: true,
      employeeId,
      ...credentials(input.password),
      mustChangePassword: !bootstrap || Array.from(input.password).length < 15,
      temporaryPasswordExpiresAt: bootstrap ? null : new Date(now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    data.users.push(user);
    return publicUser(user);
  }
  function revokeUser(data, userId, reason) {
    for (const session of data.sessions)
      if (
        session.userId === userId &&
        !session.revokedAt &&
        Date.parse(session.expiresAt) > now()
      ) {
        session.revokedAt = new Date(now()).toISOString();
        session.reason = reason;
      }
  }
  return {
    bootstrap(input) {
      return change((data) =>
        data.users.length ? null : add(data, { ...input, role: "admin" }, true),
      );
    },
    login({ username, password } = {}) {
      if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        password.length > 256
      )
        throw new PosError("Usuario o contraseña incorrectos.", 401);
      return change((data) => {
        const user = data.users.find(
          (u) => u.username === username.toLowerCase() && u.active,
        );
        if (!matchesPassword(password, user))
          throw new PosError("Usuario o contraseña incorrectos.", 401);
        if (user.mustChangePassword && user.temporaryPasswordExpiresAt && Date.parse(user.temporaryPasswordExpiresAt) <= now())
          throw new PosError('La contraseña temporal ha caducado. Pide al administrador que genere otra.', 401, 'TEMPORARY_PASSWORD_EXPIRED');
        const token = randomBytes(32).toString("hex");
        const session = {
          id: randomUUID(),
          userId: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          tokenHash: hashToken(token),
          createdAt: new Date(now()).toISOString(),
          expiresAt: new Date(now() + sessionMs).toISOString(),
          revokedAt: null,
          reason: null,
        };
        data.sessions.push(session);
        return {
          token,
          user: publicUser(user),
          session: { id: session.id, expiresAt: session.expiresAt },
        };
      });
    },
    current(token) {
      const { user, session } = identify(token);
      return {
        user: publicUser(user),
        session: { id: session.id, expiresAt: session.expiresAt },
      };
    },
    logout(token) {
      return change((data) => {
        const { session } = identify(token, data);
        session.revokedAt = new Date(now()).toISOString();
        session.reason = "logout";
        return { ok: true };
      });
    },
    changePassword(token, { currentPassword, newPassword } = {}) {
      return change(data => {
        const { user } = identify(token, data);
        if (user.mustChangePassword && user.temporaryPasswordExpiresAt && Date.parse(user.temporaryPasswordExpiresAt) <= now())
          throw new PosError('La contraseña temporal ha caducado. Pide otra al administrador.', 403, 'TEMPORARY_PASSWORD_EXPIRED');
        if (!matchesPassword(currentPassword, user))
          throw new PosError('La contraseña actual no es correcta.', 400, 'INVALID_CURRENT_PASSWORD');
        validateNewPassword(newPassword, user.username);
        if (matchesPassword(newPassword, user))
          throw new PosError('La nueva contraseña debe ser diferente de la actual.');
        Object.assign(user, credentials(newPassword), { mustChangePassword: false, temporaryPasswordExpiresAt: null, passwordChangedAt: new Date(now()).toISOString() });
        revokeUser(data, user.id, 'password_changed');
        return { ok: true };
      });
    },
    resetPassword(token, id, { currentPassword } = {}) {
      return change(data => {
        const actor = admin(token, data).user;
        if (!matchesPassword(currentPassword, actor))
          throw new PosError('Tu contraseña actual no es correcta.', 400, 'INVALID_CURRENT_PASSWORD');
        if (actor.id === id)
          throw new PosError('Para cambiar tu propia contraseña, entra en Mi cuenta.');
        const user = data.users.find(u => u.id === id && u.active);
        if (!user) throw new PosError('Cuenta activa no encontrada.', 404);
        const temporaryPassword = randomBytes(18).toString('base64url');
        const expiresAt = new Date(now() + 24 * 60 * 60 * 1000).toISOString();
        Object.assign(user, credentials(temporaryPassword), { mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt });
        revokeUser(data, user.id, 'password_reset');
        // Return the temporary password once; the journal keeps only its hash.
        return { user: publicUser(user), temporaryPassword, expiresAt };
      });
    },
    users(token) {
      const data = read();
      admin(token, data);
      return data.users.map(publicUser);
    },
    addUser(token, input) {
      return change((data) => {
        admin(token, data);
        return add(data, input);
      });
    },
    updateUser(token, id, input) {
      return change((data) => {
        const actor = admin(token, data).user;
        if (input.password !== undefined)
          throw new PosError('Usa Restablecer contraseña o Mi cuenta para cambiar la contraseña.');
        const user = data.users.find((u) => u.id === id);
        if (!user) throw new PosError("Usuario no encontrado.", 404);
        if (input.role !== undefined && !roles.includes(input.role))
          throw new PosError("Perfil no válido.");
        if (input.active !== undefined && typeof input.active !== "boolean")
          throw new PosError("Estado no válido.");
        if (
          actor.id === id &&
          (input.active === false || (input.role && input.role !== "admin"))
        )
          throw new PosError(
            "No puedes quitarte tus propios permisos de administrador.",
          );
        const updated = {
          ...user,
          ...(input.name === undefined ? {} : { name: nameOf(input.name) }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.employeeId === undefined
            ? {}
            : { employeeId: input.employeeId || null }),
        };
        if (updated.employeeId && !employeeExists(updated.employeeId))
          throw new PosError("Selecciona un empleado activo.");
        if (updated.role === "collaborator" && !updated.employeeId)
          throw new PosError("Vincula el colaborador con su empleado.");
        if (
          updated.employeeId &&
          data.users.some(
            (u) => u.id !== id && u.employeeId === updated.employeeId,
          )
        )
          throw new PosError(
            "Este empleado ya tiene una cuenta de acceso.",
            409,
          );
        Object.assign(user, updated);
        revokeUser(data, id, "account_changed");
        return publicUser(user);
      });
    },
    sessions(token) {
      const data = read();
      const actor = admin(token, data);
      return data.sessions
        .map(({ tokenHash: _hash, ...session }) => ({
          ...session,
          current: session.id === actor.session.id,
          status: session.revokedAt
            ? "revoked"
            : Date.parse(session.expiresAt) <= now()
              ? "expired"
              : "active",
        }))
        .reverse();
    },
    revoke(token, id) {
      return change((data) => {
        admin(token, data);
        const session = data.sessions.find((s) => s.id === id);
        if (!session) throw new PosError("Sesión no encontrada.", 404);
        if (!session.revokedAt) {
          session.revokedAt = new Date(now()).toISOString();
          session.reason = "admin_revoked";
        }
        return { ok: true };
      });
    },
  };
}

export function createAccessMiddleware(service, { allowPasswordChange = false } = {}) {
  return (req, res, next) => {
    try {
      const token = /^Bearer /i.test(req.get("Authorization") || "")
        ? req.get("Authorization").slice(7)
        : "";
      const { user, session } = service.current(token);
      const passwordRoute = ['GET /me', 'POST /logout', 'POST /password'].includes(`${req.method} ${req.path}`);
      if (user.mustChangePassword && !(allowPasswordChange && passwordRoute))
        throw new PosError('Cambia tu contraseña antes de continuar.', 403, 'PASSWORD_CHANGE_REQUIRED');
      req.user = user;
      req.accessToken = token;
      req.accessSession = session;
      res.set("Cache-Control", "no-store");
      next();
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ error: error.message, code: error.code });
    }
  };
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res
      .status(403)
      .json({ error: "Esta acción requiere un administrador." });
  next();
}

// Cash register, orders and vouchers are operational features available to both profiles.
export function authorizeProfile(req, res, next) {
  if (req.user.role === "admin") return next();
  const path = req.path;
  if (
    /^\/(dashboard|mail|status|operations)(\/|$)/.test(path) ||
    path === "/sessions/reconcile-order" ||
    req.body?.force ||
    (/^\/attendance\/(setup|login|logout|employees)(\/|$)/.test(path) &&
      req.method !== "GET")
  )
    return requireAdmin(req, res, next);
  next();
}

export function accessDirectory() {
  return path.join(
    process.env.POS_DATA_DIR || path.resolve(".pos-data"),
    "access",
  );
}
