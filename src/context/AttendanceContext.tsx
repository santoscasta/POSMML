import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authHeaders, clearCredentials } from "../utils/auth";
import type {
  AttendanceAction,
  AttendanceOverview,
  Employee,
  EmployeeSchedule,
} from "../types/attendance";
interface AttendanceContextValue {
  employees: Employee[];
  overview: AttendanceOverview | null;
  loading: boolean;
  available: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  punch: (action: AttendanceAction) => Promise<void>;
  addEmployee: (name: string) => Promise<void>;
  updateEmployee: (id: string, active: boolean) => Promise<void>;
  setSchedule: (id: string, schedule: EmployeeSchedule) => Promise<void>;
}
const AttendanceContext = createContext<AttendanceContextValue | null>(null);
import { useAuth } from "./AuthContext";
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [overview, setOverview] = useState<AttendanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { logout } = useAuth();
  const version = useRef(0);
  const pending = useRef<{
    id: string;
    action: AttendanceAction;
    employeeId: string;
  } | null>(null);
  const request = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const headers = authHeaders();
      const res = await fetch(`${API_BASE}/attendance${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...headers,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          res.status === 401 &&
          headers.Authorization === authHeaders().Authorization
        )
          clearCredentials();
        throw new Error(data.error || "No se pudo completar la solicitud.");
      }
      return data;
    },
    [],
  );
  const refresh = useCallback(async () => {
    const currentVersion = ++version.current;
    try {
      const list = await request<Employee[]>("/employees");
      const data = await request<AttendanceOverview>("/overview");
      if (version.current !== currentVersion) return;
      setEmployees(list);
      setOverview(data);
      setAvailable(true);
      setError("");
    } catch (err) {
      if (version.current === currentVersion)
        setError(err instanceof Error ? err.message : "No se pudo conectar.");
    } finally {
      if (version.current === currentVersion) setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    void refresh();
    const sync = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(sync, 30000);
    const requestVersion = version;
    window.addEventListener("focus", sync);
    return () => {
      ++requestVersion.current;
      clearInterval(interval);
      window.removeEventListener("focus", sync);
    };
  }, [refresh]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo conectar. Reintenta el fichaje.",
      );
      throw err;
    } finally {
      setBusy(false);
    }
  }
  return (
    <AttendanceContext.Provider
      value={{
        employees,
        overview,
        loading,
        available,
        busy,
        error,
        refresh,
        logout: async () => {
          setBusy(true);
          setError("");
          try {
            await logout();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "No se pudo cerrar la sesión. Reintenta.",
            );
            throw err;
          } finally {
            setBusy(false);
          }
        },
        punch: (action) =>
          act(async () => {
            const employeeId = overview?.employee.id || "";
            if (
              pending.current?.action !== action ||
              pending.current?.employeeId !== employeeId
            )
              pending.current = { id: crypto.randomUUID(), action, employeeId };
            await request("/events", { action, requestId: pending.current.id });
            pending.current = null;
          }),
        addEmployee: (name) =>
          act(async () => {
            await request("/employees", { name });
          }),
        updateEmployee: (id, active) =>
          act(async () => {
            await request(`/employees/${id}`, { active });
          }),
        setSchedule: (id, schedule) =>
          act(async () => {
            await request(`/employees/${id}/schedule`, schedule);
          }),
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAttendance() {
  const context = useContext(AttendanceContext);
  if (!context) throw new Error("AttendanceProvider requerido");
  return context;
}
