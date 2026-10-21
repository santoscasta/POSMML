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
    password: "admin1234",
    employeeId: marta.employee.id,
  });
  const admin = await service.login({
    username: "admin",
    password: "admin1234",
  });
  const user = await service.addUser(admin.token, {
    username: "ana",
    name: "Ana",
    password: "ana12345",
    role: "collaborator",
    employeeId: ana.id,
  });
  const collaborator = await service.login({
    username: "ana",
    password: "ana12345",
  });
  return {
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
  assert.ok(!data.includes("ana12345"));
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
    (await service.login({ username: "ANA", password: "ana12345" })).user.id,
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
    password: "password123",
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
    /8 y 128/,
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
    password: "admin1234",
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
  const again = await service.login({ username: "ana", password: "ana12345" });
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
  const second = await service.login({ username: "ana", password: "ana12345" });
  await service.updateUser(admin.token, user.id, { role: "admin" });
  for (const token of [collaborator.token, second.token])
    assert.throws(() => service.current(token), { status: 401 });
  const promoted = await service.login({
    username: "ana",
    password: "ana12345",
  });
  assert.equal(promoted.user.role, "admin");
  await service.updateUser(admin.token, user.id, {
    password: "newpassword123",
  });
  assert.throws(() => service.current(promoted.token), { status: 401 });
  await assert.rejects(
    service.login({ username: "ana", password: "ana12345" }),
    { status: 401 },
  );
  const changed = await service.login({
    username: "ana",
    password: "newpassword123",
  });
  await service.updateUser(admin.token, user.id, { active: false });
  assert.throws(() => service.current(changed.token), { status: 401 });
  await assert.rejects(
    service.login({ username: "ana", password: "newpassword123" }),
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
    password: "admin1234",
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
          Authorization: `Basic ${Buffer.from("admin:admin1234").toString("base64")}`,
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
    password: "office1234",
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
        body: JSON.stringify({ username: "admin", password: "admin1234" }),
      })
    ).status,
    429,
  );
});
