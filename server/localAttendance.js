// Isolated local preview. Intentionally does not load .env, Shopify or mail jobs.
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import { createAttendanceService } from "./lib/attendance.js";
import { createOperationStore } from "./lib/operationStore.js";
import { createAttendanceRouter } from "./routes/attendance.js";

const directory = path.resolve(".pos-data/attendance-preview");
let seedTime = Date.now();
const store = createOperationStore(directory);
const seed = createAttendanceService(store, { now: () => seedTime });
if (!seed.employees().length) {
  const { token, employee: marta } = await seed.setup({
    name: "Marta",
    pin: "1234",
  });
  const ana = await seed.addEmployee(token, { name: "Ana", pin: "2345" });
  const leo = await seed.addEmployee(token, { name: "Leo", pin: "3456" });
  const anaToken = seed.login({ employeeId: ana.id, pin: "2345" }).token;
  const leoToken = seed.login({ employeeId: leo.id, pin: "3456" }).token;
  const base = Date.now();
  const event = async (employeeToken, action, offset) => {
    seedTime = base + offset * 60000;
    await seed.punch(employeeToken, { action, requestId: randomUUID() });
  };
  // A closed journey for each employee yesterday, including a lunch break.
  for (const employeeToken of [token, anaToken, leoToken]) {
    await event(employeeToken, "entry", -1800);
    await event(employeeToken, "pause", -1620);
    await event(employeeToken, "resume", -1590);
    await event(employeeToken, "exit", -1440);
  }
  await event(anaToken, "entry", -120);
  await event(leoToken, "entry", -100);
  await event(leoToken, "pause", -15);
  console.log(
    `Ejemplos creados para ${marta.name}, ${ana.name} y ${leo.name}.`,
  );
}

const app = express();
app.use(express.json());
app.use("/api", (req, res, next) => {
  if (
    req.get("Authorization") !==
    `Basic ${Buffer.from("demo:demo").toString("base64")}`
  )
    return res
      .status(401)
      .json({
        error: "Accede con demo / demo para probar el control horario.",
      });
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/access", (req, res) => res.json({ authenticated: true }));
app.get("/api/sessions/current", (req, res) => res.json(null));
app.get("/api/operations/pending", (req, res) => res.json([]));
app.use("/api", createAttendanceRouter(createAttendanceService(store)));
app.use("/api", (req, res) =>
  res
    .status(503)
    .json({
      error:
        "Esta vista local permite probar Horario y Ajustes → Empleados. Las operaciones de tienda están disponibles en el TPV habitual.",
    }),
);
app.get("/", (req, res) => res.redirect("/horario"));
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("/api"),
    "import.meta.env.VITE_ATTENDANCE_PREVIEW": JSON.stringify("true"),
  },
});
app.use(vite.middlewares);
const port = Number(process.env.ATTENDANCE_PREVIEW_PORT || 5180);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Control horario local: http://127.0.0.1:${port}/horario`);
  console.log(
    "Acceso TPV: demo / demo. Marta: PIN 1234. Ana: PIN 2345. Leo: PIN 3456.",
  );
  console.log(`Datos independientes: ${directory}`);
});
async function close() {
  server.close();
  await vite.close();
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
