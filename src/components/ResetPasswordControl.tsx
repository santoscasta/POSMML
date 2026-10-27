import { useRef, useState, type FormEvent } from 'react';
import { apiPost } from '../utils/apiClient';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface Result { temporaryPassword: string; expiresAt: string }

export function ResetPasswordControl({ id, name, disabled, onReset }: {
  id: string; name: string; disabled: boolean; onReset: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  function close() {
    if (active.current) return;
    setOpen(false); setCurrentPassword(''); setResult(null); setVisible(false); setError(''); setCopied(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (active.current) return;
    active.current = true; setBusy(true); setError('');
    try {
      const data = await apiPost<Result>(`/auth/users/${id}/reset-password`, { currentPassword });
      setResult(data); setCurrentPassword('');
      await onReset();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.'); }
    finally { active.current = false; setBusy(false); }
  }
  return <>
    <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>Restablecer contraseña</Button>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader><DialogTitle>Restablecer contraseña de {name}</DialogTitle></DialogHeader>
        {result ? <div className="space-y-4">
          <p className="text-sm">Sus sesiones anteriores están cerradas. Entrega esta contraseña temporal a la persona: tendrá que elegir una nueva al entrar.</p>
          <label className="block space-y-1 text-sm">Contraseña temporal
            <Input type={visible ? 'text' : 'password'} autoComplete="off" value={result.temporaryPassword} readOnly />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />Mostrar contraseña temporal</label>
          <p className="text-xs text-muted-foreground">Solo se muestra en esta ventana. Caduca el {new Date(result.expiresAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(result.temporaryPassword); setCopied(true); setError(''); }
              catch { setError('No se pudo copiar. Puedes mostrar y seleccionar la contraseña.'); }
            }}>{copied ? 'Copiada' : 'Copiar contraseña'}</Button>
            <Button disabled={busy} onClick={close}>Cerrar</Button>
          </div>
        </div> : <form onSubmit={submit} className="space-y-4">
          <p className="text-sm">Se generará una contraseña temporal válida durante 24 horas y se cerrarán sus sesiones. Confirma con tu contraseña de administrador.</p>
          <label className="block space-y-1 text-sm">Tu contraseña actual
            <Input type="password" autoComplete="current-password" required maxLength={256} disabled={busy} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Restableciendo…' : 'Generar contraseña temporal'}</Button><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancelar</Button></div>
        </form>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
