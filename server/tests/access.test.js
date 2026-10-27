import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { createOperationStore } from "../lib/operationStore.js";
import {
  createAccessService,
  createAccessMiddleware,
  authorizeProfile,
} from "../lib/access.js";
import { createAccessRouter } from "../routes/access.js";
import { createAttendanceService } from "../lib/attendance.js";
import { createAttendanceRouter } from "../routes/attendance.js";

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pos-access-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let time = Date.parse("2026-10-22T08:00:00Z");
  const now = () => time;
  const attendanceStore = createOperationStore(
    path.join(directory, "attendance"),
  );
  const attendance = createAttendanceService(attendanceStore, { now });
  const marta = await attendance.setup({ name: "Marta", pin: "1234" });
  // The old attendance role must never grant global admin permissions.
  const ana = await attendance.addEmployee(marta.token, {
    name: "Ana",
    pin: "2345",
    role: "manager",
  });
  const leo = await attendance.addEmployee(marta.token, {
    name: "Leo",
    pin: "3456",
  });
  const store = createOperationStore(path.join(directory, "access"));
  const options = {
    now,
    employeeExists: (id) => attendance.employees().some((e) => e.id === id),
  };
  const service = createAccessService(store, options);
  await service.bootstrap({
    username: "admin",
    name: "Marta",
    password: "admin-local-pass-2026",
    employeeId: marta.employee.id,
  });
  const admin = await service.login({
    username: "admin",
    password: "admin-local-pass-2026",
  });
  const user = await service.addUser(admin.token, {
    username: "ana",
    name: "Ana",
    password: "ana-temporal-pass-2026",
    role: "collaborator",
    employeeId: ana.id,
  });
  const initial = await service.login({ username: "ana", password: "ana-temporal-pass-2026" });
  await service.changePassword(initial.token, { currentPassword: "ana-temporal-pass-2026", newPassword: "ana-local-pass-2026" });
  const collaborator = await service.login({
    username: "ana",
    password: "ana-local-pass-2026",
  });
  return {
    directory,
    service,
    store,
    options,
    attendanceStore,
    attendance,
    admin,
    collaborator,
    user,
    marta,
    ana,
    leo,
    advance: (minutes) => {
      time += minutes * 60000;
    },
  };
}

test("access creates individual accounts, hashes passwords and tokens, and never returns secrets", async (t) => {
  const { service, store, admin, collaborator } = await fixture(t);
  assert.equal(service.current(collaborator.token).user.role, "collaborator");
  const users = service.users(admin.token);
  assert.ok(
    users.every((user) => !("passwordHash" in user) && !("salt" in user)),
  );
  assert.ok(
    service.sessions(admin.token).every((session) => !("tokenHash" in session)),
  );
  const data = JSON.stringify(store.read());
  assert.ok(!data.includes("ana-local-pass-2026"));
  assert.ok(!data.includes(collaborator.token));
  assert.equal(
    await service.bootstrap({
      username: "replacement",
      name: "Wrong",
      password: "different123",
    }),
    null,
  );
  await assert.rejects(service.login({ username: "ana", password: "wrong" }), {
    status: 401,
  });
  assert.equal(
    (await service.login({ username: "ANA", password: "ana-local-pass-2026" })).user.id,
    collaborator.user.id,
  );
});

test("access requires admin to list accounts and sessions or modify permissions", async (t) => {
  const { service, collaborator, user } = await fixture(t);
  assert.throws(() => service.users(collaborator.token), { status: 403 });
  assert.throws(() => service.sessions(collaborator.token), { status: 403 });
  await assert.rejects(
    service.updateUser(collaborator.token, user.id, { role: "admin" }),
    { status: 403 },
  );
  await assert.rejects(service.addUser(collaborator.token, {}), {
    status: 403,
  });
  await assert.rejects(
    service.revoke(collaborator.token, collaborator.session.id),
    { status: 403 },
  );
});

test("access rejects duplicate identities, invalid profiles and missing employee links", async (t) => {
  const { service, admin, ana, leo } = await fixture(t);
  const input = {
    name: "Other",
    username: "other",
    role: "collaborator",
    password: "other-local-pass-2026",
  };
  await assert.rejects(service.addUser(admin.token, input), /Vincula/);
  await assert.rejects(
    service.addUser(admin.token, { ...input, employeeId: "missing" }),
    /empleado activo/,
  );
  await assert.rejects(
    service.addUser(admin.token, { ...input, employeeId: ana.id }),
    /ya tiene una cuenta/,
  );
  await assert.rejects(
    service.addUser(admin.token, {
      ...input,
      employeeId: leo.id,
      role: "superuser",
    }),
    /Perfil no válido/,
  );
  await assert.rejects(
    service.addUser(admin.token, {
      ...input,
      employeeId: leo.id,
      username: "ADMIN",
    }),
    /ya existe/,
  );
  await assert.rejects(
    service.addUser(admin.token, {
      ...input,
      employeeId: leo.id,
      password: "123",
    }),
    /15 y 128/,
  );
  assert.equal(service.users(admin.token).length, 2);
});

test("access preserves sessions across server restart and expires them after eight hours", async (t) => {
  const { service, store, options, admin, collaborator, advance } =
    await fixture(t);
  const restarted = createAccessService(store, options);
  assert.equal(
    restarted.current(collaborator.token).user.id,
    collaborator.user.id,
  );
  advance(8 * 60);
  assert.throws(() => restarted.current(collaborator.token), { status: 401 });
  const next = await service.login({
    username: "admin",
    password: "admin-local-pass-2026",
  });
  assert.equal(
    service.sessions(next.token).find((s) => s.id === admin.session.id).status,
    "expired",
  );
});

test("access logout and revocation invalidate tokens without altering work attendance", async (t) => {
  const { service, attendance, collaborator, admin, attendanceStore } =
    await fixture(t);
  await attendance.punch(
    { user: collaborator.user },
    { action: "entry", requestId: randomUUID() },
  );
  await service.logout(collaborator.token);
  assert.throws(() => service.current(collaborator.token), { status: 401 });
  const again = await service.login({ username: "ana", password: "ana-local-pass-2026" });
  assert.equal(
    attendance.overview({ user: again.user }).employees[0].status,
    "working",
  );
  await service.revoke(admin.token, again.session.id);
  assert.throws(() => service.current(again.token), { status: 401 });
  assert.equal(attendanceStore.read().events.length, 1);
  assert.equal(
    service.sessions(admin.token).find((s) => s.id === collaborator.session.id)
      .reason,
    "logout",
  );
  assert.equal(
    service.sessions(admin.token).find((s) => s.id === again.session.id).reason,
    "admin_revoked",
  );
});

test("access profile, password and active-state changes revoke all affected sessions immediately", async (t) => {
  const { service, admin, collaborator, user } = await fixture(t);
  const second = await service.login({ username: "ana", password: "ana-local-pass-2026" });
  await service.updateUser(admin.token, user.id, { role: "admin" });
  for (const token of [collaborator.token, second.token])
    assert.throws(() => service.current(token), { status: 401 });
  const promoted = await service.login({
    username: "ana",
    password: "ana-local-pass-2026",
  });
  assert.equal(promoted.user.role, "admin");
  const reset = await service.resetPassword(admin.token, user.id, { currentPassword: "admin-local-pass-2026" });
  const temporary = await service.login({ username: "ana", password: reset.temporaryPassword });
  await service.changePassword(temporary.token, { currentPassword: reset.temporaryPassword, newPassword: "ana-nueva-clave-2026" });
  assert.throws(() => service.current(promoted.token), { status: 401 });
  await assert.rejects(
    service.login({ username: "ana", password: "ana-local-pass-2026" }),
    { status: 401 },
  );
  const changed = await service.login({
    username: "ana",
    password: "ana-nueva-clave-2026",
  });
  await service.updateUser(admin.token, user.id, { active: false });
  assert.throws(() => service.current(changed.token), { status: 401 });
  await assert.rejects(
    service.login({ username: "ana", password: "ana-nueva-clave-2026" }),
    { status: 401 },
  );
  assert.ok(service.current(admin.token));
});

test("access protects the active administrator and validates linked-user edits atomically", async (t) => {
  const { service, admin, user } = await fixture(t);
  await assert.rejects(
    service.updateUser(admin.token, admin.user.id, { role: "collaborator" }),
    /propios permisos/,
  );
  await assert.rejects(
    service.updateUser(admin.token, admin.user.id, { active: false }),
    /propios permisos/,
  );
  await assert.rejects(
    service.updateUser(admin.token, user.id, {
      name: "Changed",
      employeeId: admin.user.employeeId,
    }),
    /ya tiene una cuenta/,
  );
  assert.equal(
    service.users(admin.token).find((u) => u.id === user.id).name,
    "Ana",
  );
});

test("access preserves expired-session history when an administrator changes an account", async (t) => {
  const { service, collaborator, user, advance } = await fixture(t);
  advance(8 * 60 + 1);
  const admin = await service.login({
    username: "admin",
    password: "admin-local-pass-2026",
  });
  await service.updateUser(admin.token, user.id, { name: "Ana actualizada" });
  const session = service
    .sessions(admin.token)
    .find((s) => s.id === collaborator.session.id);
  assert.equal(session.status, "expired");
  assert.equal(session.revokedAt, null);
  assert.equal(session.name, "Ana");
});

async function httpFixture(t) {
  const fixtureResult = await fixture(t);
  const { service, attendance } = fixtureResult;
  const app = express();
  app.use(express.json());
  app.use("/api", createAccessRouter(service));
  app.use("/api", createAccessMiddleware(service), authorizeProfile);
  app.use("/api", createAttendanceRouter(attendance));
  for (const route of [
    "/dashboard",
    "/mail",
    "/status",
    "/operations/pending",
    "/sessions/reconcile-order",
    "/sessions/open",
    "/sessions/current",
    "/orders",
    "/vouchers",
    "/graphql",
  ])
    app.all(`/api${route}`, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return {
    ...fixtureResult,
    url: `http://127.0.0.1:${server.address().port}/api`,
  };
}

test("access HTTP enforces profile restrictions, blocks Basic fallback and rejects forged user roles", async (t) => {
  const { url, admin, collaborator } = await httpFixture(t);
  const get = (path, token = collaborator.token) =>
    fetch(url + path, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await get("/auth/me")).status, 200);
  assert.equal(
    (
      await fetch(url + "/auth/me", {
        headers: {
          Authorization: `Basic ${Buffer.from("admin:admin-local-pass-2026").toString("base64")}`,
        },
      })
    ).status,
    401,
  );
  for (const path of [
    "/dashboard",
    "/mail",
    "/status",
    "/operations/pending",
    "/auth/users",
    "/auth/sessions",
  ]) {
    assert.equal((await get(path)).status, 403, path);
    assert.equal((await get(path, admin.token)).status, 200, path);
  }
  for (const path of ["/sessions/current", "/orders", "/vouchers", "/graphql"])
    assert.equal((await get(path)).status, 200, path);
  for (const force of [true, "true", []]) {
    const res = await fetch(url + "/sessions/open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${collaborator.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "admin", force }),
    });
    assert.equal(res.status, 403);
  }
  const forged = await fetch(url + "/auth/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${collaborator.token}`,
      "Content-Type": "application/json",
      "X-Role": "admin",
    },
    body: JSON.stringify({ role: "admin", user: admin.user }),
  });
  assert.equal(forged.status, 403);
});

test("access attendance scope follows the logged-in user and ignores old PIN tokens and supplied employee IDs", async (t) => {
  const { url, collaborator, admin, marta, attendance } = await httpFixture(t);
  const headers = {
    Authorization: `Bearer ${collaborator.token}`,
    "X-Attendance-Token": marta.token,
    "Content-Type": "application/json",
  };
  const overview = await (
    await fetch(url + "/attendance/overview", { headers })
  ).json();
  assert.equal(overview.employee.role, "employee");
  assert.equal(overview.employees.length, 1);
  assert.equal(overview.employees[0].id, collaborator.user.employeeId);
  const list = await (
    await fetch(url + "/attendance/employees", { headers })
  ).json();
  assert.equal(list.length, 1);
  const punch = await fetch(url + "/attendance/events", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "entry",
      requestId: randomUUID(),
      employeeId: admin.user.employeeId,
    }),
  });
  assert.equal((await punch.json()).employeeId, collaborator.user.employeeId);
  assert.equal(attendance.overview({ user: admin.user }).journeys.length, 1);
  for (const path of [
    "/attendance/setup",
    "/attendance/login",
    "/attendance/logout",
    "/attendance/employees",
  ])
    assert.equal(
      (await fetch(url + path, { method: "POST", headers, body: "{}" })).status,
      403,
      path,
    );
});

test("access admins without an associated employee can manage attendance but cannot punch under another name", async (t) => {
  const { service, admin, attendance, attendanceStore } = await fixture(t);
  const account = await service.addUser(admin.token, {
    name: "Office",
    username: "office",
    password: "office-local-pass-2026",
    role: "admin",
  });
  const data = attendance.overview({ user: account });
  assert.equal(data.employees.length, 3);
  await assert.rejects(
    attendance.punch(
      { user: account },
      { action: "entry", requestId: randomUUID() },
    ),
    /Vincula tu cuenta/,
  );
  await attendance.addEmployee(
    { user: account },
    { name: "New employee", pin: "5678" },
  );
  assert.equal(attendanceStore.read().employees.length, 4);
});

test("access HTTP login throttles repeated password guesses", async (t) => {
  const { url } = await httpFixture(t);
  for (let i = 0; i < 10; i++) {
    const response = await fetch(url + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ana", password: "wrong" }),
    });
    assert.equal(response.status, 401);
  }
  assert.equal(
    (
      await fetch(url + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin-local-pass-2026" }),
      })
    ).status,
    429,
  );
});

test('personal password change verifies the current password and rejects weak or reused passwords atomically', async t => {
  const f = await fixture(t);
  const before = f.store.read();
  for (const [currentPassword, newPassword] of [
    ['wrong', 'una frase nueva de prueba'],
    ['ana-local-pass-2026', 'short'],
    ['ana-local-pass-2026', 'passwordpassword'],
    ['ana-local-pass-2026', '123456789012345'],
    ['ana-local-pass-2026', ' '.repeat(20)],
    ['ana-local-pass-2026', 'ana-local-pass-2026'],
  ]) {
    await assert.rejects(f.service.changePassword(f.collaborator.token, { currentPassword, newPassword }), { status: 400 });
    assert.deepEqual(f.store.read(), before);
  }
  await assert.rejects(f.service.changePassword('', { currentPassword: 'ana-local-pass-2026', newPassword: 'otra frase de prueba' }), { status: 401 });
});

test('personal change closes every access session while preserving attendance, cash data, and the administrator', async t => {
  const f = await fixture(t);
  const again = await f.service.login({ username: 'ana', password: 'ana-local-pass-2026' });
  await f.attendance.punch({ user: f.collaborator.user }, { action: 'entry', requestId: randomUUID() });
  const cash = createOperationStore(f.directory);
  cash.write({ operations: {}, movements: [{ sessionId: 'open-cash', amount: 20 }], sessionDates: { 'open-cash': '2026-10-22' } });
  const attendanceBefore = f.attendanceStore.read(), cashBefore = cash.read();
  await f.service.changePassword(f.collaborator.token, { currentPassword: 'ana-local-pass-2026', newPassword: 'mis prendas favoritas 🌻' });
  for (const token of [f.collaborator.token, again.token]) assert.throws(() => f.service.current(token), { status: 401 });
  await assert.rejects(f.service.login({ username: 'ana', password: 'ana-local-pass-2026' }), { status: 401 });
  const restarted = createAccessService(createOperationStore(path.join(f.directory, 'access')), f.options);
  const access = await restarted.login({ username: 'ana', password: 'mis prendas favoritas 🌻' });
  assert.equal(access.user.mustChangePassword, false);
  assert.deepEqual(f.attendanceStore.read(), attendanceBefore);
  assert.deepEqual(cash.read(), cashBefore);
  assert.ok(f.service.current(f.admin.token));
  assert.ok(f.service.sessions(f.admin.token).filter(s => [f.collaborator.session.id, again.session.id].includes(s.id)).every(s => s.reason === 'password_changed'));
  assert.ok(!JSON.stringify(f.store.read()).includes('mis prendas favoritas 🌻'));
});

test('administrator reset requires reauthentication and returns a temporary password once without storing plaintext', async t => {
  const f = await fixture(t);
  const before = f.store.read();
  await assert.rejects(f.service.resetPassword(f.collaborator.token, f.admin.user.id, { currentPassword: 'ana-local-pass-2026' }), { status: 403 });
  await assert.rejects(f.service.resetPassword(f.admin.token, f.user.id, { currentPassword: 'wrong' }), { status: 400 });
  await assert.rejects(f.service.resetPassword(f.admin.token, f.admin.user.id, { currentPassword: 'admin-local-pass-2026' }), /Mi cuenta/);
  assert.deepEqual(f.store.read(), before);
  const result = await f.service.resetPassword(f.admin.token, f.user.id, { currentPassword: 'admin-local-pass-2026' });
  assert.ok(result.temporaryPassword.length >= 24);
  assert.equal(result.user.mustChangePassword, true);
  assert.equal(Date.parse(result.expiresAt) - Date.parse('2026-10-22T08:00:00Z'), 24 * 60 * 60 * 1000);
  assert.throws(() => f.service.current(f.collaborator.token), { status: 401 });
  assert.ok(!JSON.stringify(f.store.read()).includes(result.temporaryPassword));
  assert.ok(!JSON.stringify(f.service.users(f.admin.token)).includes(result.temporaryPassword));
  const temporary = await f.service.login({ username: 'ana', password: result.temporaryPassword });
  await f.service.changePassword(temporary.token, { currentPassword: result.temporaryPassword, newPassword: 'una frase personal nueva' });
  await assert.rejects(f.service.login({ username: 'ana', password: result.temporaryPassword }), { status: 401 });
  assert.ok(await f.service.login({ username: 'ana', password: 'una frase personal nueva' }));
});

test('temporary accounts are restricted by the HTTP server until they change their password', async t => {
  const f = await httpFixture(t);
  const reset = await f.service.resetPassword(f.admin.token, f.user.id, { currentPassword: 'admin-local-pass-2026' });
  const temporary = await f.service.login({ username: 'ana', password: reset.temporaryPassword });
  const headers = { Authorization: `Bearer ${temporary.token}`, 'Content-Type': 'application/json' };
  for (const route of ['/sessions/current', '/graphql', '/attendance/overview', '/auth/users', '/auth/sessions']) {
    const response = await fetch(f.url + route, { headers });
    assert.equal(response.status, 403, route);
    assert.equal((await response.json()).code, 'PASSWORD_CHANGE_REQUIRED');
  }
  for (const route of ['/sessions/open', '/attendance/events', `/auth/users/${f.user.id}`]) {
    const response = await fetch(f.url + route, { method: 'POST', headers, body: JSON.stringify({ mustChangePassword: false, role: 'admin' }) });
    assert.equal(response.status, 403, route);
  }
  assert.equal((await fetch(f.url + '/auth/me', { headers })).status, 200);
  const response = await fetch(f.url + '/auth/password', { method: 'POST', headers, body: JSON.stringify({ currentPassword: reset.temporaryPassword, newPassword: 'un cambio personal seguro', userId: f.admin.user.id }) });
  assert.equal(response.status, 200);
  assert.equal((await fetch(f.url + '/auth/me', { headers })).status, 401);
  assert.ok(f.service.current(f.admin.token));
  const permanent = await f.service.login({ username: 'ana', password: 'un cambio personal seguro' });
  assert.equal((await fetch(f.url + '/attendance/overview', { headers: { Authorization: `Bearer ${permanent.token}` } })).status, 200);
});

test('temporary expiry and password-change requirement survive restart, including sessions opened near expiry', async t => {
  const f = await fixture(t);
  const reset = await f.service.resetPassword(f.admin.token, f.user.id, { currentPassword: 'admin-local-pass-2026' });
  f.advance(23 * 60 + 30);
  const restarted = createAccessService(createOperationStore(path.join(f.directory, 'access')), f.options);
  const temporary = await restarted.login({ username: 'ana', password: reset.temporaryPassword });
  assert.equal(temporary.user.mustChangePassword, true);
  f.advance(30);
  await assert.rejects(restarted.login({ username: 'ana', password: reset.temporaryPassword }), { code: 'TEMPORARY_PASSWORD_EXPIRED' });
  await assert.rejects(restarted.changePassword(temporary.token, { currentPassword: reset.temporaryPassword, newPassword: 'mi nueva frase personal' }), { code: 'TEMPORARY_PASSWORD_EXPIRED' });
  assert.equal((await restarted.logout(temporary.token)).ok, true);
});

test('new accounts must change their initial password and legacy editing cannot bypass password management', async t => {
  const f = await fixture(t);
  const account = await f.service.addUser(f.admin.token, { name: 'Leo', username: 'leo', password: 'clave inicial para leo', role: 'collaborator', employeeId: f.leo.id, mustChangePassword: false });
  assert.equal(account.mustChangePassword, true);
  await assert.rejects(f.service.updateUser(f.admin.token, f.user.id, { password: 'una contraseña distinta', mustChangePassword: false }), /Restablecer contraseña/);
  await f.service.updateUser(f.admin.token, account.id, { mustChangePassword: false });
  const temporary = await f.service.login({ username: 'leo', password: 'clave inicial para leo' });
  assert.equal(temporary.user.mustChangePassword, true);
  const reset = await f.service.resetPassword(f.admin.token, account.id, { currentPassword: 'admin-local-pass-2026' });
  const next = await f.service.resetPassword(f.admin.token, account.id, { currentPassword: 'admin-local-pass-2026' });
  assert.notEqual(next.temporaryPassword, reset.temporaryPassword);
  await assert.rejects(f.service.login({ username: 'leo', password: reset.temporaryPassword }), { status: 401 });
  await f.service.updateUser(f.admin.token, account.id, { active: false });
  await assert.rejects(f.service.resetPassword(f.admin.token, account.id, { currentPassword: 'admin-local-pass-2026' }), { status: 404 });
});

test('password verification attempts are limited without revoking a legitimate session', async t => {
  const f = await httpFixture(t);
  const headers = { Authorization: `Bearer ${f.collaborator.token}`, 'Content-Type': 'application/json' };
  for (let i = 0; i < 10; i++) {
    assert.equal((await fetch(f.url + '/auth/password', { method: 'POST', headers, body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'una nueva frase larga' }) })).status, 400);
  }
  const response = await fetch(f.url + '/auth/password', { method: 'POST', headers, body: JSON.stringify({ currentPassword: 'ana-local-pass-2026', newPassword: 'una nueva frase larga' }) });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
  assert.ok(f.service.current(f.collaborator.token));
});

test('existing accounts continue working and weak bootstrap passwords only grant password-change access', async t => {
  const f = await fixture(t);
  const legacy = f.store.read();
  for (const user of legacy.users) { delete user.mustChangePassword; delete user.temporaryPasswordExpiresAt; }
  f.store.write(legacy);
  assert.equal((await f.service.login({ username: 'ana', password: 'ana-local-pass-2026' })).user.mustChangePassword, false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-password-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = createAccessService(createOperationStore(directory));
  await service.bootstrap({ username: 'first', name: 'First administrator', password: 'legacy123' });
  const initial = await service.login({ username: 'first', password: 'legacy123' });
  assert.equal(initial.user.mustChangePassword, true);
  assert.throws(() => service.users(initial.token), { code: 'PASSWORD_CHANGE_REQUIRED' });
  await service.changePassword(initial.token, { currentPassword: 'legacy123', newPassword: 'la primera frase segura' });
  const permanent = await service.login({ username: 'first', password: 'la primera frase segura' });
  assert.ok(service.users(permanent.token));
});
