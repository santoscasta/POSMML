import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { apiGet, apiPost } from "../utils/apiClient";
import {
  authHeaders,
  clearCredentials,
  hasCredentials,
  setSessionToken,
} from "../utils/auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AuthContext } from "../context/AuthContext";
import type { AccessUser, AccessSession } from "../types/auth";
import { PasswordChangeForm } from './PasswordChangeForm';

export function AuthGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<{
    user: AccessUser;
    session: AccessSession;
  } | null>(null);
  const [checking, setChecking] = useState(hasCredentials);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const reset = (event: Event) => {
      setAccess(null);
      setChecking(false);
      setError('');
      setNotice(event instanceof CustomEvent && typeof event.detail?.notice === 'string' ? event.detail.notice : '');
    };
    window.addEventListener("pos:unauthorized", reset);
    return () => window.removeEventListener("pos:unauthorized", reset);
  }, []);

  useEffect(() => {
    let active = true;
    const authorization = authHeaders().Authorization;
    if (hasCredentials())
      void apiGet<{ user: AccessUser; session: AccessSession }>("/auth/me")
        .then((result) => {
          if (active && authorization === authHeaders().Authorization)
            setAccess(result);
        })
        .catch(() => {
          if (active)
            setError("No se pudo recuperar la sesión. Vuelve a acceder.");
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    return () => {
      active = false;
    };
  }, []);

  const signedIn = Boolean(access);
  useEffect(() => {
    if (!signedIn) return;
    const verify = () => {
      const authorization = authHeaders().Authorization;
      if (document.visibilityState === "visible")
        void apiGet<{ user: AccessUser; session: AccessSession }>("/auth/me")
          .then((result) => {
            if (authorization === authHeaders().Authorization)
              setAccess(result);
          })
          .catch(() => {});
    };
    const interval = window.setInterval(verify, 60000);
    window.addEventListener("focus", verify);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", verify);
    };
  }, [signedIn]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice('');
    try {
      const result = await apiPost<{
        token: string;
        user: AccessUser;
        session: AccessSession;
      }>("/auth/login", { username, password });
      setSessionToken(result.token);
      setPassword("");
      setAccess(result);
    } catch (error) {
      clearCredentials();
      setError(
        error instanceof Error ? error.message : "No se pudo iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking)
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        Recuperando sesión…
      </main>
    );
  if (access)
    return (
      <AuthContext.Provider
        value={{
          ...access,
          logout: async () => {
            await apiPost("/auth/logout", {});
            clearCredentials();
          },
        }}
      >
        {access.user.mustChangePassword ? <main className="flex min-h-dvh items-center justify-center bg-background p-4">
          <section className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6">
            <h1 className="text-xl font-semibold">Elige tu contraseña</h1>
            <PasswordChangeForm forced />
          </section>
        </main> : children}
      </AuthContext.Provider>
    );
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={login}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6"
      >
        <h1 className="text-xl font-semibold">Acceso a POS MML</h1>
        <p className="text-sm text-muted-foreground">
          Accede con tu cuenta. El menú y los permisos se adaptan a tu perfil.
        </p>
        {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {import.meta.env.VITE_ATTENDANCE_PREVIEW === "true" && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            <strong>Prueba local por perfiles</strong>
            <br />
            Administrador: <strong>admin / admin-local-pass-2026</strong>
            <br />
            Colaborador: <strong>ana / ana-local-pass-2026</strong>
          </div>
        )}
        <label className="block space-y-1">
          <span>Usuario</span>
          <Input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span>Contraseña</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
