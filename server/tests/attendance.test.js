import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { createOperationStore } from "../lib/operationStore.js";
import { createAttendanceService } from "../lib/attendance.js";
import { createAttendanceRouter } from "../routes/attendance.js";

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-attendance-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let time = Date.parse("2026-10-20T07:00:00Z");
  const store = createOperationStore(dir);
  const service = createAttendanceService(store, { now: () => time });
  const manager = await service.setup({ name: "Marta", pin: "0123" });
  const employee = await service.addEmployee(manager.token, {
    name: "Ana",
    pin: "2345",
  });
  const login = service.login({ employeeId: employee.id, pin: "2345" });
  const advance = (minutes) => {
    time += minutes * 60000;
  };
  const punch = (action, token = login.token, requestId = randomUUID()) =>
    service.punch(token, { action, requestId });
  return {
    store,
    service,
    manager,
    employee,
    login,
    advance,
    punch,
    now: () => time,
  };
}

test("attendance setup protects PINs, refuses reinitialization and enforces manager permissions", async (t) => {
  const { service, store, login, manager } = await fixture(t);
  assert.deepEqual(Object.keys(service.employees()[0]).sort(), [
    "active",
    "id",
    "name",
    "role",
  ]);
  const saved = store.read().employees[0];
  assert.equal(saved.pin, undefined);
  assert.notEqual(saved.pinHash, "0123");
  assert.equal(saved.role, "manager");
  await assert.rejects(service.setup({ name: "Other", pin: "1111" }), {
    status: 409,
  });
  await assert.rejects(
    service.addEmployee(login.token, { name: "Other", pin: "1111" }),
    { status: 403 },
  );
  await assert.rejects(
    service.addEmployee(manager.token, { name: "Other", pin: "abc" }),
    /4 y 8 cifras/,
  );
  assert.throws(() => service.overview("invalid"), {
    status: 401,
    code: "ATTENDANCE_AUTH",
  });
});

test("attendance calculates multiple breaks and permits exit during a break, with split journeys", async (t) => {
  const { service, login, punch, advance } = await fixture(t);
  await assert.rejects(punch("resume"), { status: 409 });
  await punch("entry");
  advance(120);
  await assert.rejects(punch("entry"), { status: 409 });
  await punch("pause");
  advance(15);
  await punch("resume");
  advance(60);
  await punch("pause");
  advance(10);
  await punch("exit");
  let row = service.overview(login.token).journeys[0];
  assert.equal(row.workedMs, 180 * 60000);
  assert.equal(row.breakMs, 25 * 60000);
  assert.equal(row.status, "out");
  assert.ok(row.endedAt);
  advance(30);
  await punch("entry");
  advance(20);
  const result = service.overview(login.token);
  assert.equal(result.journeys.length, 2);
  assert.equal(result.journeys[0].workedMs, 20 * 60000);
  assert.equal(result.journeys[0].endedAt, null);
  assert.equal(result.employees[0].status, "working");
});

test("attendance retry returns the original event without duplicates and rejects reused identities", async (t) => {
  const { service, store, login, manager, punch, advance } = await fixture(t);
  const requestId = randomUUID();
  const first = await punch("entry", login.token, requestId);
  advance(10);
  await punch("pause");
  assert.deepEqual(await punch("entry", login.token, requestId), first);
  assert.equal(store.read().events.length, 2);
  await assert.rejects(punch("exit", login.token, requestId), { status: 409 });
  await assert.rejects(punch("entry", manager.token, requestId), {
    status: 409,
  });
  assert.equal(service.overview(login.token).journeys[0].status, "paused");
});

test("attendance history is private per employee, while managers see the team and inactive history", async (t) => {
  const { service, manager, employee, login, punch } = await fixture(t);
  await punch("entry");
  await punch("exit");
  await punch("entry", manager.token);
  await punch("exit", manager.token);
  assert.equal(service.overview(login.token).journeys.length, 1);
  assert.equal(service.overview(login.token).employees.length, 1);
  assert.equal(
    service.overview(login.token, { employeeId: manager.employee.id }).journeys
      .length,
    0,
  );
  assert.equal(service.overview(manager.token).journeys.length, 2);
  await service.updateEmployee(manager.token, employee.id, { active: false });
  assert.equal(service.employees().length, 1);
  assert.equal(service.overview(manager.token).journeys.length, 2);
  assert.throws(() => service.overview(login.token), { status: 401 });
});

test("attendance prevents deactivation of a working employee and of the current manager", async (t) => {
  const { service, manager, employee, punch } = await fixture(t);
  await assert.rejects(
    service.updateEmployee(manager.token, manager.employee.id, {
      active: false,
    }),
    /propio usuario/,
  );
  await punch("entry");
  await assert.rejects(
    service.updateEmployee(manager.token, employee.id, { active: false }),
    { status: 409 },
  );
  await punch("pause");
  await assert.rejects(
    service.updateEmployee(manager.token, employee.id, { active: false }),
    { status: 409 },
  );
  await punch("exit");
  await service.updateEmployee(manager.token, employee.id, { active: false });
  await service.updateEmployee(manager.token, employee.id, { active: true });
  assert.ok(service.login({ employeeId: employee.id, pin: "2345" }).token);
});

test("attendance persists across server restarts, requires PIN again and revokes changed credentials", async (t) => {
  const { service, store, manager, employee, login, punch, now } =
    await fixture(t);
  assert.throws(() => service.login({ employeeId: employee.id, pin: "9999" }), {
    status: 403,
  });
  await punch("entry");
  const restarted = createAttendanceService(store, { now });
  assert.throws(() => restarted.overview(login.token), { status: 401 });
  const newLogin = restarted.login({ employeeId: employee.id, pin: "2345" });
  assert.equal(
    restarted.overview(newLogin.token).employees[0].status,
    "working",
  );
  await service.updateEmployee(manager.token, employee.id, { pin: "6789" });
  assert.throws(() => service.overview(login.token), { status: 401 });
  assert.throws(() => service.login({ employeeId: employee.id, pin: "2345" }), {
    status: 403,
  });
  assert.ok(service.login({ employeeId: employee.id, pin: "6789" }).token);
});

test("attendance expires authentication without ending the work journey", async (t) => {
  const { service, employee, login, punch, advance } = await fixture(t);
  await punch("entry");
  advance(8 * 60 + 1);
  assert.throws(() => service.overview(login.token), { status: 401 });
  const next = service.login({ employeeId: employee.id, pin: "2345" });
  assert.equal(service.overview(next.token).employees[0].status, "working");
  service.logout(next.token);
  assert.throws(() => service.overview(next.token), { status: 401 });
  const again = service.login({ employeeId: employee.id, pin: "2345" });
  assert.equal(service.overview(again.token).journeys.length, 1);
});

test("attendance filters start dates in Madrid across midnight and computes DST elapsed time", async (t) => {
  const { store } = await fixture(t);
  let time = Date.parse("2026-10-24T22:30:00Z"); // 00:30 Madrid, before the winter time change.
  const service = createAttendanceService(store, { now: () => time });
  const employee = service.employees().find((e) => e.name === "Ana");
  const { token } = service.login({ employeeId: employee.id, pin: "2345" });
  await service.punch(token, { action: "entry", requestId: randomUUID() });
  time += 4 * 60 * 60000;
  await service.punch(token, { action: "exit", requestId: randomUUID() });
  assert.equal(
    service.overview(token, { from: "2026-10-25", to: "2026-10-25" })
      .journeys[0].workedMs,
    4 * 60 * 60000,
  );
  assert.equal(
    service.overview(token, { from: "2026-10-24", to: "2026-10-24" }).journeys
      .length,
    0,
  );
  assert.throws(
    () => service.overview(token, { from: "2026-02-30" }),
    /Fecha no válida/,
  );
  assert.throws(
    () => service.overview(token, { from: "2026-10-26", to: "2026-10-25" }),
    /fecha inicial/,
  );
});

test("attendance serializes simultaneous punches and rejects a backwards server clock", async (t) => {
  const { store, service, login, punch, advance } = await fixture(t);
  const result = await Promise.allSettled([punch("entry"), punch("entry")]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.read().events.length, 1);
  advance(-1);
  await assert.rejects(punch("pause"), /hora del servidor/);
  assert.equal(service.overview(login.token).journeys[0].workedMs, 0);
});

test("attendance HTTP routes enforce employee tokens and throttle PIN guesses", async (t) => {
  const { service, employee, login } = await fixture(t);
  const app = express();
  app.use(express.json());
  app.use("/api", createAttendanceRouter(service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/api/attendance`;
  assert.equal((await fetch(`${url}/overview`)).status, 401);
  const overview = await fetch(`${url}/overview`, {
    headers: { "X-Attendance-Token": login.token },
  });
  assert.equal(overview.status, 200);
  assert.equal((await overview.json()).employees.length, 1);
  const add = await fetch(`${url}/employees`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Attendance-Token": login.token,
    },
    body: JSON.stringify({ name: "Other", pin: "9999" }),
  });
  assert.equal(add.status, 403);
  for (let i = 0; i < 10; i++) {
    const response = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee.id, pin: "9999" }),
    });
    assert.equal(response.status, 403);
  }
  const limited = await fetch(`${url}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: employee.id, pin: "2345" }),
  });
  assert.equal(limited.status, 429);
});
