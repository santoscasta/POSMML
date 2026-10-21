import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { normalizeSchedule, punchWindow } from "../lib/attendanceSchedule.js";
import { createOperationStore } from "../lib/operationStore.js";
import { createAttendanceService } from "../lib/attendance.js";
import { createAttendanceRouter } from "../routes/attendance.js";
import {
  createAccessService,
  createAccessMiddleware,
  authorizeProfile,
} from "../lib/access.js";
import { createAccessRouter } from "../routes/access.js";

const schedule = {
  enabled: true,
  entryTime: "09:00",
  exitTime: "17:00",
  toleranceMinutes: 15,
};
const octMadrid = (time) => Date.parse(`2026-10-22T${time}+02:00`);

test("attendance schedule validates times and margins and defaults to fifteen minutes", () => {
  assert.deepEqual(
    normalizeSchedule({ enabled: true, entryTime: "09:00", exitTime: "17:00" }),
    schedule,
  );
  for (const input of [
    null,
    [],
    {},
    { ...schedule, enabled: "yes" },
    { ...schedule, entryTime: "9:00" },
    { ...schedule, exitTime: "24:00" },
    { ...schedule, entryTime: "09:60" },
    { ...schedule, exitTime: "09:00" },
    { ...schedule, toleranceMinutes: -1 },
    { ...schedule, toleranceMinutes: 121 },
    { ...schedule, toleranceMinutes: 1.5 },
    { ...schedule, toleranceMinutes: "15" },
  ])
    assert.throws(() => normalizeSchedule(input), { status: 400 });
  assert.equal(normalizeSchedule({ enabled: false }).enabled, false);
  assert.equal(
    normalizeSchedule({ ...schedule, toleranceMinutes: 0 }).toleranceMinutes,
    0,
  );
});

test("attendance schedule enforces both inclusive entry and exit minutes", () => {
  const entryCases = [
    ["08:44:59", false],
    ["08:45:00", true],
    ["09:00:00", true],
    ["09:15:59", true],
    ["09:16:00", false],
  ];
  const exitCases = [
    ["16:44:59", false],
    ["16:45:00", true],
    ["17:00:00", true],
    ["17:15:59", true],
    ["17:16:00", false],
  ];
  for (const [time, allowed] of entryCases)
    assert.equal(
      punchWindow(schedule, "entry", octMadrid(time)).allowed,
      allowed,
      time,
    );
  for (const [time, allowed] of exitCases)
    assert.equal(
      punchWindow(schedule, "exit", octMadrid(time)).allowed,
      allowed,
      time,
    );
  assert.deepEqual(punchWindow(schedule, "entry", octMadrid("09:00:00")), {
    enabled: true,
    allowed: true,
    time: "09:00",
    min: "08:45",
    max: "09:15",
  });
  assert.equal(
    punchWindow(
      { ...schedule, toleranceMinutes: 0 },
      "entry",
      octMadrid("09:00:59"),
    ).allowed,
    true,
  );
  assert.equal(
    punchWindow(
      { ...schedule, toleranceMinutes: 0 },
      "entry",
      octMadrid("09:01:00"),
    ).allowed,
    false,
  );
});

test("attendance schedule supports midnight windows, night shifts and both Madrid DST occurrences", () => {
  const night = { ...schedule, entryTime: "23:55", exitTime: "06:00" };
  assert.equal(
    punchWindow(night, "entry", octMadrid("23:40:00")).allowed,
    true,
  );
  assert.equal(
    punchWindow(night, "entry", octMadrid("00:10:59")).allowed,
    true,
  );
  assert.equal(
    punchWindow(night, "entry", octMadrid("00:11:00")).allowed,
    false,
  );
  assert.equal(
    punchWindow(night, "entry", octMadrid("12:00:00")).allowed,
    false,
  );
  assert.equal(punchWindow(night, "exit", octMadrid("05:45:00")).allowed, true);
  const midnight = punchWindow(
    { ...night, entryTime: "00:05" },
    "entry",
    octMadrid("23:50:00"),
  );
  assert.equal(midnight.allowed, true);
  assert.equal(midnight.min, "23:50");
  assert.equal(midnight.max, "00:20");
  const winter = { ...schedule, entryTime: "02:30", toleranceMinutes: 0 };
  for (const at of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"])
    assert.equal(punchWindow(winter, "entry", Date.parse(at)).allowed, true);
  assert.equal(
    punchWindow(schedule, "entry", Date.parse("2026-12-01T08:00:00Z")).allowed,
    true,
  );
});

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-schedule-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = octMadrid("08:00:00");
  const store = createOperationStore(path.join(dir, "attendance"));
  const service = createAttendanceService(store, { now: () => now });
  const manager = await service.setup({ name: "Marta", pin: "1234" });
  const employee = await service.addEmployee(manager.token, {
    name: "Ana",
    pin: "2345",
  });
  const colleague = await service.addEmployee(manager.token, {
    name: "Leo",
    pin: "3456",
  });
  const login = service.login({ employeeId: employee.id, pin: "2345" });
  const punch = (action, requestId = randomUUID()) =>
    service.punch(login.token, { action, requestId });
  const at = (value) => {
    now = octMadrid(value);
  };
  return {
    dir,
    store,
    service,
    manager,
    employee,
    colleague,
    login,
    at,
    punch,
    now: () => now,
  };
}

test("attendance schedules persist, keep configuration history, and require an administrator", async (t) => {
  const { store, service, manager, employee, login, now } = await fixture(t);
  await assert.rejects(
    service.setSchedule(login.token, employee.id, schedule),
    { status: 403 },
  );
  await assert.rejects(
    service.setSchedule(manager.token, "missing", schedule),
    { status: 404 },
  );
  await service.setSchedule(manager.token, employee.id, schedule);
  assert.deepEqual(
    service.employees().find((e) => e.id === employee.id).schedule,
    schedule,
  );
  await assert.rejects(
    service.setSchedule(manager.token, employee.id, {
      ...schedule,
      toleranceMinutes: -1,
    }),
    { status: 400 },
  );
  assert.equal(store.read().scheduleChanges.length, 1);
  const recreated = createAttendanceService(store, { now });
  assert.deepEqual(
    recreated.employees().find((e) => e.id === employee.id).schedule,
    schedule,
  );
  await service.setSchedule(manager.token, employee.id, {
    ...schedule,
    entryTime: "10:00",
  });
  assert.equal(store.read().scheduleChanges[1].previous.entryTime, "09:00");
  assert.equal(
    store.read().scheduleChanges[1].changedBy.id,
    manager.employee.id,
  );
});

test("attendance blocks early/late entries and exits without writing events or changing actual times", async (t) => {
  const { store, service, manager, employee, punch, at, login } =
    await fixture(t);
  await service.setSchedule(manager.token, employee.id, schedule);
  await assert.rejects(punch("entry"), {
    status: 403,
    code: "OUTSIDE_SCHEDULE",
  });
  assert.equal(store.read().events.length, 0);
  assert.equal(service.overview(login.token).punchWindows.entry.allowed, false);
  at("08:45:00");
  await punch("entry");
  assert.equal(store.read().events[0].at, "2026-10-22T06:45:00.000Z");
  at("12:00:00");
  await punch("pause");
  at("12:20:00");
  await punch("resume");
  await assert.rejects(punch("exit"), {
    status: 403,
    code: "OUTSIDE_SCHEDULE",
  });
  assert.equal(store.read().events.length, 3);
  at("17:16:00");
  login.token = service.login({ employeeId: employee.id, pin: '2345' }).token;
  manager.token = service.login({ employeeId: manager.employee.id, pin: '1234' }).token;
  await assert.rejects(punch("exit"), { status: 403 });
  assert.equal(service.overview(login.token).employees[0].status, "working");
  // Admin can explicitly extend today's exit window while retaining the actual punch time.
  await service.setSchedule(manager.token, employee.id, {
    ...schedule,
    toleranceMinutes: 20,
  });
  await punch("exit");
  const row = service.overview(login.token).journeys[0];
  assert.equal(row.endedAt, "2026-10-22T15:16:00.000Z");
  assert.equal(row.events[0].window.min, "08:45");
  assert.equal(row.events.at(-1).window.max, "17:20");
  assert.equal(row.events[0].schedule.toleranceMinutes, 15);
  assert.equal(row.events.at(-1).schedule.toleranceMinutes, 20);
});

test("attendance retries preserve the original result after the allowed window has closed", async (t) => {
  const { store, service, manager, employee, punch, at } = await fixture(t);
  await service.setSchedule(manager.token, employee.id, schedule);
  const key = randomUUID();
  await assert.rejects(punch("entry", key), { status: 403 });
  at("09:15:59");
  const first = await punch("entry", key);
  at("09:16:00");
  assert.deepEqual(await punch("entry", key), first);
  assert.equal(store.read().events.length, 1);
});

test("attendance leaves unconfigured employees unrestricted and permits pauses outside entry/exit windows", async (t) => {
  const { service, manager, employee, punch, at, login, colleague } =
    await fixture(t);
  await punch("entry");
  at("08:01:00");
  await punch("exit");
  await service.setSchedule(manager.token, employee.id, schedule);
  at("09:00:00");
  await punch("entry");
  at("12:00:00");
  await punch("pause");
  await punch("resume");
  await service.setSchedule(manager.token, employee.id, {
    ...schedule,
    enabled: false,
  });
  await punch("exit");
  assert.equal(service.overview(login.token).punchWindows.exit.allowed, true);
  assert.equal(
    service.employees().find((e) => e.id === colleague.id).schedule,
    undefined,
  );
});

test("attendance HTTP enforces administrator configuration and server-time checks even with forged client fields", async (t) => {
  const f = await fixture(t);
  const { dir, store, service, manager, employee, colleague, now } = f;
  const access = createAccessService(
    createOperationStore(path.join(dir, "access")),
    {
      now,
      employeeExists: (id) => service.employees().some((e) => e.id === id),
    },
  );
  await access.bootstrap({
    username: "admin",
    password: "admin1234",
    name: "Marta",
    employeeId: manager.employee.id,
  });
  const admin = await access.login({
    username: "admin",
    password: "admin1234",
  });
  await access.addUser(admin.token, {
    username: "ana",
    password: "ana12345",
    name: "Ana",
    role: "collaborator",
    employeeId: employee.id,
  });
  const collaborator = await access.login({
    username: "ana",
    password: "ana12345",
  });
  const app = express();
  app.use(express.json());
  app.use("/api", createAccessRouter(access));
  app.use("/api", createAccessMiddleware(access), authorizeProfile);
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
  const base = `http://127.0.0.1:${server.address().port}/api/attendance`;
  const post = (path, body, token = collaborator.token) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await post(`/employees/${employee.id}/schedule`, schedule)).status,
    403,
  );
  assert.equal(
    (await post(`/employees/${employee.id}/schedule`, schedule, admin.token))
      .status,
    200,
  );
  assert.equal(access.current(collaborator.token).user.role, "collaborator");
  const response = await post("/events", {
    action: "entry",
    requestId: randomUUID(),
    at: "2026-10-22T07:00:00Z",
    employeeId: colleague.id,
    schedule: { enabled: false },
    window: { allowed: true },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "OUTSIDE_SCHEDULE");
  assert.equal(store.read().events.length, 0);
  assert.equal(store.read().scheduleChanges[0].changedBy.id, admin.user.id);
  const others = await (
    await fetch(base + "/employees", {
      headers: { Authorization: `Bearer ${collaborator.token}` },
    })
  ).json();
  assert.equal(others.length, 1);
  assert.deepEqual(others[0].schedule, schedule);
});
