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
} from "../types/attendance";
interface AttendanceContextValue {
  employees: Employee[];
  overview: AttendanceOverview | null;
  loading: boolean;
  available: boolean;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  login: (id: string, pin: string) => Promise<void>;
  setup: (name: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  punch: (action: AttendanceAction) => Promise<void>;
  addEmployee: (name: string, pin: string, role: string) => Promise<void>;
  updateEmployee: (id: string, active: boolean) => Promise<void>;
}
const AttendanceContext = createContext<AttendanceContextValue | null>(null);
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [overview, setOverview] = useState<AttendanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = useRef("");
  const version = useRef(0);
  const pending = useRef<{
    id: string;
    action: AttendanceAction;
    employeeId: string;
  } | null>(null);
  const request = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const requestToken = token.current;
      const res = await fetch(`${API_BASE}/attendance${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...authHeaders(),
          ...(requestToken ? { "X-Attendance-Token": requestToken } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.code === "ATTENDANCE_AUTH") {
          if (token.current === requestToken) {
            token.current = "";
            setOverview(null);
          }
        } else if (res.status === 401) clearCredentials();
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
      const data = token.current
        ? await request<AttendanceOverview>("/overview")
        : null;
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
  async function authenticate(path: string, input: unknown) {
    await act(async () => {
      const result = await request<{ token: string }>(path, input);
      ++version.current;
      token.current = result.token;
      pending.current = null;
    });
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
        login: (id, pin) => authenticate("/login", { employeeId: id, pin }),
        setup: (name, pin) => authenticate("/setup", { name, pin }),
        logout: () =>
          act(async () => {
            await request("/logout", {});
            ++version.current;
            token.current = "";
            pending.current = null;
            setOverview(null);
          }),
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
        addEmployee: (name, pin, role) =>
          act(async () => {
            await request("/employees", { name, pin, role });
          }),
        updateEmployee: (id, active) =>
          act(async () => {
            await request(`/employees/${id}`, { active });
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
