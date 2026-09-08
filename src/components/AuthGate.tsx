import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { apiGet } from '../utils/apiClient';
import { clearCredentials, setCredentials } from '../utils/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function AuthGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const reset = () => setAuthenticated(false);
    window.addEventListener('pos:unauthorized', reset);
    return () => window.removeEventListener('pos:unauthorized', reset);
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCredentials(username, password);
    try {
      await apiGet('/access');
      setPassword('');
      setAuthenticated(true);
    } catch (error) {
      clearCredentials();
      setError(error instanceof Error ? error.message : 'No se pudo iniciar sesión');
    } finally { setLoading(false); }
  }

  if (authenticated) return children;
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">Acceso a POS MML</h1>
      <label className="block space-y-1"><span>Usuario</span><Input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
      <label className="block space-y-1"><span>Contraseña</span><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</Button>
    </form>
  </main>;
}
