import { useEffect, useState } from "react";
import { ShieldCheck, Users, RefreshCw, Download } from "lucide-react";
import { apiGet, apiPost } from "../utils/apiClient";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";
import type { AccessUser, UserRole, UserSession } from "../types/auth";
import type { Employee, EmployeeSchedule } from "../types/attendance";
import { ScheduleEditor } from "../components/attendance/ScheduleEditor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const roleLabel = (role: UserRole) =>
  role === "admin" ? "Administrador" : "Colaborador";
const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const selectClass =
  "h-9 w-full min-w-0 rounded-lg border bg-white px-2 text-sm";
const statusLabel = {
  active: "Activa",
  expired: "Caducada",
  revoked: "Cerrada",
};
const reasonLabel: Record<string, string> = {
  logout: "Salida del usuario",
  admin_revoked: "Revocada por administrador",
  account_changed: "Cuenta modificada",
};

function exportSessions(sessions: UserSession[]) {
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const rows = [
    [
      "Usuario",
      "Nombre",
      "Perfil al acceder",
      "Inicio (Madrid)",
      "Caducidad (Madrid)",
      "Cierre (Madrid)",
      "Estado",
      "Motivo",
    ],
    ...sessions.map((s) => [
      s.username,
      s.name,
      roleLabel(s.role),
      dateTime(s.createdAt),
      dateTime(s.expiresAt),
      s.revokedAt ? dateTime(s.revokedAt) : "",
      statusLabel[s.status],
      s.reason ? reasonLabel[s.reason] || s.reason : "",
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "sesiones-usuarios.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UserEditor({
  account,
  employees,
  currentId,
  busy,
  save,
  saveSchedule,
}: {
  account: AccessUser;
  employees: Employee[];
  currentId: string;
  busy: boolean;
  save: (id: string, input: unknown) => void;
  saveSchedule: (id: string, schedule: EmployeeSchedule) => void;
}) {
  const [name, setName] = useState(account.name);
  const [role, setRole] = useState(account.role);
  const [employeeId, setEmployeeId] = useState(account.employeeId || "");
  const [password, setPassword] = useState("");
  const linkedEmployee = employees.find(
    (employee) => employee.id === account.employeeId,
  );
  return (
    <details className="rounded-lg border bg-white p-4">
      <summary className="cursor-pointer text-sm">
        <strong>{account.name}</strong>{" "}
        <span className="text-muted-foreground">
          · {account.username} · {roleLabel(account.role)} ·{" "}
          {account.active ? "Activo" : "Inactivo"}
          {account.id === currentId ? " · Tu cuenta" : ""}
        </span>
      </summary>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(account.id, {
            name,
            role,
            employeeId: employeeId || null,
            ...(password ? { password } : {}),
          });
        }}
      >
        <label className="space-y-1 text-sm">
          Nombre
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          Perfil
          <select
            className={selectClass}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={account.id === currentId}
          >
            <option value="admin">Administrador</option>
            <option value="collaborator">Colaborador</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Empleado asociado
          <select
            className={selectClass}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required={role === "collaborator"}
          >
            <option value="">Sin empleado asociado</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Nueva contraseña
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={128}
            placeholder="Dejar vacía para conservarla"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button disabled={busy} type="submit">
            Guardar cambios
          </Button>
          <Button
            disabled={busy || account.id === currentId}
            variant="outline"
            type="button"
            onClick={() => save(account.id, { active: !account.active })}
          >
            {account.active ? "Desactivar acceso" : "Reactivar acceso"}
          </Button>
        </div>
      </form>
      {linkedEmployee ? (
        <ScheduleEditor
          key={`${linkedEmployee.id}:${JSON.stringify(linkedEmployee.schedule)}`}
          employee={linkedEmployee}
          unrestricted={account.role === "admin"}
          busy={busy}
          save={saveSchedule}
        />
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {account.role === "admin"
            ? "El administrador también debe registrar su jornada. Asocia su ficha de empleado y guarda la cuenta para fichar y configurar su horario, sin bloqueos por hora."
            : "Asocia un empleado activo y guarda la cuenta para configurar su horario."}
        </p>
      )}
    </details>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const { employees, setSchedule } = useAttendance();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("collaborator");
  const [employeeId, setEmployeeId] = useState("");
  async function load() {
    const [accounts, history] = await Promise.all([
      apiGet<AccessUser[]>("/auth/users"),
      apiGet<UserSession[]>("/auth/sessions"),
    ]);
    setUsers(accounts);
    setSessions(history);
  }
  useEffect(() => {
    let live = true;
    void Promise.all([
      apiGet<AccessUser[]>("/auth/users"),
      apiGet<UserSession[]>("/auth/sessions"),
    ])
      .then(([accounts, history]) => {
        if (live) {
          setUsers(accounts);
          setSessions(history);
        }
      })
      .catch((err) => {
        if (live)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el registro.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  }
  const freeEmployees = employees.filter(
    (e) => !users.some((u) => u.employeeId === e.id),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ShieldCheck className="size-5" />
            Usuarios y sesiones
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Controla quién accede al TPV y qué puede ver cada persona.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || loading}
          onClick={() => void action(async () => {}, "Registro actualizado.")}
        >
          <RefreshCw />
          Actualizar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 text-sm">
          <strong>Administrador</strong>
          <p className="mt-2 leading-6 text-muted-foreground">
            Todas las pantallas, configuración, cuentas de usuario, sesiones y
            fichajes del equipo.
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4 text-sm">
          <strong>Colaborador</strong>
          <p className="mt-2 leading-6 text-muted-foreground">
            POS, pedidos, caja, vales y sus propias jornadas. Puede exportar sus
            fichajes.
          </p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <section className="rounded-xl border bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Users className="size-4" />
          Crear cuenta de acceso
        </h3>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await apiPost("/auth/users", {
                name,
                username,
                password,
                role,
                employeeId: employeeId || null,
              });
              setName("");
              setUsername("");
              setPassword("");
              setEmployeeId("");
            }, "Cuenta creada. Ya puede iniciar sesión.");
          }}
        >
          <label className="space-y-1 text-sm">
            Nombre
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            Usuario
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              pattern="[a-zA-Z0-9._\-]{2,60}"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            Contraseña inicial
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            Perfil
            <select
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="collaborator">Colaborador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Empleado asociado
            <select
              className={selectClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required={role === "collaborator"}
            >
              <option value="">Selecciona un empleado</option>
              {freeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || loading}>
              Crear usuario
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Da de alta primero a la persona en Ajustes → Empleados. Cada empleado
          se vincula a una sola cuenta.
        </p>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Cuentas de usuario</h3>
        <p className="text-xs text-muted-foreground">
          Cambiar una cuenta cierra sus sesiones abiertas. El empleado y sus
          fichajes se conservan al desactivar el acceso.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
        ) : (
          users.map((account) => (
            <UserEditor
              key={`${account.id}:${account.role}:${account.active}:${account.employeeId}`}
              account={account}
              employees={employees.filter(
                (e) =>
                  e.id === account.employeeId ||
                  !users.some((u) => u.employeeId === e.id),
              )}
              currentId={user.id}
              busy={busy}
              save={(id, input) =>
                void action(
                  () => apiPost(`/auth/users/${id}`, input),
                  "Cuenta actualizada. Sus sesiones anteriores se han cerrado.",
                )
              }
              saveSchedule={(id, schedule) =>
                void action(
                  () => setSchedule(id, schedule),
                  account.role === "admin"
                    ? "Horario guardado como referencia. El administrador puede fichar a cualquier hora, sin bloqueo."
                    : "Horario guardado. Los límites de fichaje ya están aplicados.",
                )
              }
            />
          ))
        )}
      </section>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="font-semibold">Registro de sesiones</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Accesos al TPV. La jornada laboral se registra de forma
              independiente.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!sessions.length || busy}
            onClick={() => exportSessions(sessions)}
          >
            <Download />
            Exportar sesiones CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y bg-slate-50 text-xs text-muted-foreground">
              <tr>
                {[
                  "Usuario",
                  "Perfil al acceder",
                  "Inicio",
                  "Estado",
                  "Cierre / caducidad",
                  "Acciones",
                ].map((label) => (
                  <th className="px-4 py-3 font-medium" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <strong>{s.name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {s.username}
                      {s.current ? " · Esta sesión" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">{roleLabel(s.role)}</td>
                  <td className="px-4 py-3 text-xs">{dateTime(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.status === "active"
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                      }
                    >
                      {statusLabel[s.status]}
                    </span>
                    {s.reason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reasonLabel[s.reason] || s.reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {dateTime(s.revokedAt || s.expiresAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || s.status !== "active" || s.current}
                      onClick={() =>
                        void action(
                          () => apiPost(`/auth/sessions/${s.id}/revoke`, {}),
                          "Sesión revocada. Ese acceso ya no puede operar.",
                        )
                      }
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !sessions.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Todavía no hay sesiones registradas.
          </p>
        )}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Las sesiones caducan a las 8 horas. Recargar la página conserva la
          sesión de esta pestaña; cambiar de usuario requiere cerrar el acceso
          actual.
        </p>
      </section>
    </div>
  );
}
