import { useState } from "react";
import {
  Clock3,
  LogIn,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Download,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useAttendance } from "../context/AttendanceContext";
import { attendanceLabels, duration, madridDate } from "../utils/attendance";
import type { AttendanceStatus, Journey } from "../types/attendance";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-white px-3 text-sm";
const time = (value: string) =>
  new Date(value).toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
const date = (value: string) =>
  new Date(value).toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const actionLabels = {
  entry: "Entrada",
  pause: "Inicio de pausa",
  resume: "Regreso de pausa",
  exit: "Salida",
};
const quiet = (promise: Promise<unknown>) => {
  void promise.catch(() => {});
};

function Status({ value }: { value: AttendanceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        value === "working"
          ? "bg-emerald-50 text-emerald-800"
          : value === "paused"
            ? "bg-amber-50 text-amber-800"
            : "bg-slate-100 text-slate-600",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          value === "working"
            ? "bg-emerald-500"
            : value === "paused"
              ? "bg-amber-500"
              : "bg-slate-400",
        )}
      />
      {attendanceLabels[value]}
    </span>
  );
}

function exportJourneys(rows: Journey[]) {
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const lines = [
    [
      "Empleado",
      "Fecha de entrada (Madrid)",
      "Entrada",
      "Fecha de salida (Madrid)",
      "Salida",
      "Minutos trabajados",
      "Minutos de pausa",
      "Estado",
      "Entrada prevista",
      "Entrada mínima",
      "Entrada máxima",
      "Margen entrada (minutos)",
      "Salida prevista",
      "Salida mínima",
      "Salida máxima",
      "Margen salida (minutos)",
    ],
    ...rows.map((row) => {
      const entry = row.events.find((event) => event.action === "entry");
      const exit = row.events.find((event) => event.action === "exit");
      return [
        row.employeeName,
        madridDate(new Date(row.startedAt)),
        time(row.startedAt),
        row.endedAt ? madridDate(new Date(row.endedAt)) : "",
        row.endedAt ? time(row.endedAt) : "",
        String(Math.floor(row.workedMs / 60000)),
        String(Math.floor(row.breakMs / 60000)),
        row.endedAt ? "Cerrada" : attendanceLabels[row.status],
        entry?.schedule?.entryTime || "",
        entry?.window?.min || "",
        entry?.window?.max || "",
        entry?.schedule ? String(entry.schedule.toleranceMinutes) : "",
        exit?.schedule?.exitTime || "",
        exit?.window?.min || "",
        exit?.window?.max || "",
        exit?.schedule ? String(exit.schedule.toleranceMinutes) : "",
      ];
    }),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + lines.map((row) => row.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `jornadas-${madridDate()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AttendancePage({ manage = false }: { manage?: boolean }) {
  const {
    overview,
    loading,
    available,
    busy,
    error,
    refresh,
    punch,
    logout,
    addEmployee,
    updateEmployee,
  } = useAttendance();
  const [from, setFrom] = useState(madridDate());
  const [to, setTo] = useState(madridDate());
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const { user } = useAuth();
  const canPunch = Boolean(user.employeeId);
  const manager = overview?.employee.role === "manager";
  const current = overview?.employees.find(
    (e) => e.id === overview.employee.id,
  );
  const status = current?.status || "out";
  const entryWindow = overview?.punchWindows?.entry;
  const exitWindow = overview?.punchWindows?.exit;
  const relevantWindow = status === "out" ? entryWindow : exitWindow;
  const ownToday =
    overview?.journeys.filter(
      (j) =>
        j.employeeId === overview.employee.id &&
        madridDate(new Date(j.startedAt)) === madridDate(),
    ) || [];
  const activeJourney = overview?.journeys.find(
    (j) => j.employeeId === overview.employee.id && !j.endedAt,
  );
  const invalidRange = Boolean(from && to && from > to);
  const rows =
    overview?.journeys.filter(
      (j) =>
        !invalidRange &&
        (!employeeFilter || j.employeeId === employeeFilter) &&
        (!from || madridDate(new Date(j.startedAt)) >= from) &&
        (!to || madridDate(new Date(j.startedAt)) <= to),
    ) || [];
  const team = overview?.employees.filter((e) => e.active) || [];
  async function register(action: "entry" | "pause" | "resume" | "exit") {
    setNotice("");
    try {
      await punch(action);
      setNotice(`${actionLabels[action]} registrada correctamente.`);
    } catch {
      /* Shared error is displayed below. */
    }
  }
  return (
    <div
      className={cn(
        "mx-auto space-y-6",
        manage ? "" : "max-w-6xl p-4 sm:p-6 lg:p-8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {manage ? "Configuración del equipo" : "Equipo y jornadas"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {manage ? "Empleados" : "Control horario"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {manage
              ? "Gestiona las personas que pueden fichar en el TPV."
              : "Registra tu jornada y consulta tus horas de trabajo."}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || loading}
          onClick={() => quiet(refresh())}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>
      {import.meta.env.VITE_ATTENDANCE_PREVIEW === "true" && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Vista local de prueba · Los datos de ejemplo se guardan solo en este
          equipo.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && overview && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loading ? (
        <div className="rounded-xl border bg-white p-10 text-center text-muted-foreground">
          Cargando control horario…
        </div>
      ) : !overview ? (
        !available ? (
          <Button variant="outline" onClick={() => quiet(refresh())}>
            Reintentar conexión
          </Button>
        ) : (
          <p className="rounded-lg border bg-white p-6">
            No se pudo cargar tu perfil de control horario. Pulsa Actualizar
            para reintentar.
          </p>
        )
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">
                  {overview.employee.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold">{overview.employee.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {manager ? "Administrador" : "Empleado"} ·{" "}
                    {date(overview.serverNow)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setNotice("");
                  quiet(logout());
                }}
              >
                Cambiar de usuario
              </Button>
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
              <div>
                <Status value={status} />
                <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight">
                  {duration(
                    ownToday.reduce((sum, row) => sum + row.workedMs, 0),
                  )}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Trabajo en jornadas iniciadas hoy · Pausas:{" "}
                  {duration(
                    ownToday.reduce((sum, row) => sum + row.breakMs, 0),
                  )}
                </p>
                {activeJourney && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Entrada: {date(activeJourney.startedAt)} a las{" "}
                    {time(activeJourney.startedAt)}
                  </p>
                )}
                {activeJourney &&
                  madridDate(new Date(activeJourney.startedAt)) !==
                    madridDate() && (
                    <p className="mt-3 max-w-lg rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      Tienes una jornada abierta de un día anterior. Comprueba
                      tu registro antes de continuar. Su tiempo no se incluye en
                      las jornadas iniciadas hoy.
                    </p>
                  )}
                {current?.schedule?.enabled && (
                  <div className="mt-4 max-w-lg rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                    <p className="font-semibold">Tus franjas de fichaje</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p>
                        Entrada:{" "}
                        <strong>
                          {entryWindow?.min}–{entryWindow?.max}
                        </strong>
                      </p>
                      <p>
                        Salida:{" "}
                        <strong>
                          {exitWindow?.min}–{exitWindow?.max}
                        </strong>
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5">
                      Margen de ±{current.schedule.toleranceMinutes} minutos.
                      Hora de Madrid. Fuera de estas franjas no se pueden
                      registrar entradas o salidas.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
                {!canPunch ? (
                  <p className="max-w-64 text-sm text-muted-foreground">
                    Para fichar, vincula tu cuenta con un empleado en Ajustes →
                    Usuarios y sesiones.
                  </p>
                ) : status === "out" ? (
                  <Button
                    className="h-11 px-6"
                    disabled={busy || entryWindow?.allowed === false}
                    onClick={() => quiet(register("entry"))}
                  >
                    <LogIn />
                    Fichar entrada
                  </Button>
                ) : (
                  <>
                    <Button
                      className="h-11 px-6"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        quiet(
                          register(status === "paused" ? "resume" : "pause"),
                        )
                      }
                    >
                      {status === "paused" ? <Play /> : <Pause />}
                      {status === "paused"
                        ? "Volver de pausa"
                        : "Iniciar pausa"}
                    </Button>
                    <Button
                      className="h-11 px-6"
                      disabled={busy || exitWindow?.allowed === false}
                      onClick={() => quiet(register("exit"))}
                    >
                      <LogOut />
                      Fichar salida
                    </Button>
                  </>
                )}
                {canPunch && relevantWindow?.allowed === false && (
                  <p
                    role="status"
                    className="max-w-64 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900"
                  >
                    {status === "out" ? "Entrada" : "Salida"} bloqueada fuera de{" "}
                    {relevantWindow.min}–{relevantWindow.max}. Contacta con el
                    administrador si necesitas ajustar el horario.
                  </p>
                )}
                <p className="max-w-52 text-xs leading-5 text-muted-foreground">
                  {busy
                    ? "Guardando…"
                    : "Hora de Madrid · Las pausas se descuentan del tiempo trabajado."}
                </p>
              </div>
            </div>
          </section>
          {manage ? (
            manager ? (
              <section className="space-y-5 rounded-xl border bg-white p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Users className="size-5" />
                  <h2 className="text-lg font-semibold">Gestionar empleados</h2>
                </div>
                <form
                  className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNotice("");
                    quiet(
                      addEmployee(name).then(() => {
                        setName("");
                        setNotice(
                          "Empleado creado. Vincúlalo a una cuenta en Ajustes → Usuarios y sesiones.",
                        );
                      }),
                    );
                  }}
                >
                  <label className="space-y-1.5 text-sm">
                    Nombre
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      required
                    />
                  </label>
                  <Button className="h-10" type="submit" disabled={busy}>
                    <Plus />
                    Añadir empleado
                  </Button>
                </form>
                <div className="divide-y">
                  {overview.employees.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Empleado · {e.active ? "Activo" : "Inactivo"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          busy ||
                          e.id === overview.employee.id ||
                          (e.active && e.status !== "out")
                        }
                        onClick={() => quiet(updateEmployee(e.id, !e.active))}
                      >
                        {e.active ? "Desactivar" : "Reactivar"}
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Desactivar conserva el historial. Para desactivar a alguien,
                  primero debe cerrar su jornada.
                </p>
              </section>
            ) : (
              <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
                <ShieldCheck className="mb-3 size-6" />
                Identifícate como responsable para gestionar empleados.
              </div>
            )
          ) : (
            <>
              {manager && (
                <section className="rounded-xl border bg-white p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">El equipo ahora</h2>
                    <p className="text-xs text-muted-foreground">
                      {team.filter((e) => e.status === "working").length}{" "}
                      trabajando ·{" "}
                      {team.filter((e) => e.status === "paused").length} en
                      pausa
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {team.map((e) => (
                      <div
                        key={e.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <span className="text-sm font-medium">{e.name}</span>
                        <Status value={e.status} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="overflow-hidden rounded-xl border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                  <h2 className="text-lg font-semibold">
                    {manager ? "Historial del equipo" : "Mis jornadas"}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!rows.length || busy}
                    onClick={() => exportJourneys(rows)}
                  >
                    <Download />
                    Exportar CSV
                  </Button>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Desde
                    <Input
                      className="h-10 w-full min-w-0"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Hasta
                    <Input
                      className="h-10 w-full min-w-0"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  {manager && (
                    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                      Empleado
                      <select
                        className={selectClass}
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                      >
                        <option value="">Todo el equipo</option>
                        {overview.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.active ? "" : " (inactivo)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {invalidRange && (
                  <p role="alert" className="px-5 pb-3 text-sm text-red-700">
                    La fecha inicial debe ser anterior a la final.
                  </p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-2 border-y bg-slate-50 px-5 py-3 text-xs text-slate-600">
                  <span>
                    <strong className="text-slate-900">{rows.length}</strong>{" "}
                    jornadas
                  </span>
                  <span>
                    Trabajo:{" "}
                    <strong className="text-slate-900">
                      {duration(rows.reduce((s, j) => s + j.workedMs, 0))}
                    </strong>
                  </span>
                  <span>
                    Pausas:{" "}
                    <strong className="text-slate-900">
                      {duration(rows.reduce((s, j) => s + j.breakMs, 0))}
                    </strong>
                  </span>
                  <span>{rows.filter((j) => !j.endedAt).length} abiertas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        {[
                          "Empleado / fecha",
                          "Entrada",
                          "Salida",
                          "Pausas",
                          "Trabajado",
                          "Detalle",
                        ].map((label) => (
                          <th key={label} className="px-5 py-3 font-medium">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-5 py-4">
                            <p className="font-medium">{row.employeeName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {date(row.startedAt)}
                            </p>
                          </td>
                          <td className="px-5 py-4 tabular-nums">
                            {time(row.startedAt)}
                          </td>
                          <td className="px-5 py-4">
                            {row.endedAt ? (
                              <>
                                <span className="tabular-nums">
                                  {time(row.endedAt)}
                                </span>
                                {madridDate(new Date(row.endedAt)) !==
                                  madridDate(new Date(row.startedAt)) && (
                                  <p className="text-xs text-muted-foreground">
                                    {date(row.endedAt)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <Status value={row.status} />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                            {duration(row.breakMs)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">
                            {duration(row.workedMs)}
                          </td>
                          <td className="px-5 py-4">
                            <details>
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                Ver fichajes
                              </summary>
                              <ol className="mt-2 space-y-1 whitespace-nowrap text-xs">
                                {row.events.map((event) => (
                                  <li key={event.id}>
                                    {date(event.at)} · {time(event.at)} ·{" "}
                                    {actionLabels[event.action]}
                                    {event.window && (
                                      <span className="block text-muted-foreground">
                                        Franja aplicada: {event.window.min}–
                                        {event.window.max} · Madrid
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ol>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!rows.length && (
                  <div className="px-5 py-12 text-center">
                    <Clock3 className="mx-auto mb-3 size-7 text-slate-300" />
                    <p className="font-medium">Sin jornadas en estas fechas</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cambia el período o registra tu primera entrada.
                    </p>
                  </div>
                )}
                <p className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground">
                  Se filtra por fecha de entrada en Madrid. Las jornadas
                  abiertas muestran el tiempo acumulado; se actualiza cada 30
                  segundos. Los fichajes originales se conservan.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
