import { useState, type FormEvent } from 'react';
import { apiPost } from '../utils/apiClient';
import { clearCredentials } from '../utils/auth';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function PasswordChangeForm({ forced = false }: { forced?: boolean }) {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (newPassword !== confirmation) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/auth/password', { currentPassword, newPassword });
      clearCredentials('Contraseña actualizada. Vuelve a iniciar sesión con la nueva contraseña.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">{forced
      ? 'Tu contraseña es temporal. Elige una contraseña personal para continuar.'
      : 'Al guardar se cerrarán todas tus sesiones de acceso. La caja y tus fichajes se conservan.'}</p>
    <label className="block space-y-1 text-sm">Usuario
      <Input value={user.username} autoComplete="username" readOnly />
    </label>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block space-y-1 text-sm">Contraseña actual
        <Input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required maxLength={256} />
      </label>
      <label className="block space-y-1 text-sm">Nueva contraseña
        <Input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={15} maxLength={256} aria-describedby="password-policy" />
      </label>
      <p id="password-policy" className="text-xs text-muted-foreground">Entre 15 y 128 caracteres. Puedes usar una frase con espacios. Evita contraseñas comunes y usa una diferente de la actual.</p>
      <label className="block space-y-1 text-sm">Repetir nueva contraseña
        <Input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required minLength={15} maxLength={256} />
      </label>
    </fieldset>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar nueva contraseña'}</Button>
      {forced && <Button type="button" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await logout(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo salir.'); setBusy(false); }
      }}>Salir</Button>}
    </div>
  </form>;
}
