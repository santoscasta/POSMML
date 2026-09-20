import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../utils/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Category = 'closing' | 'discrepancy' | 'unclosed' | 'pending' | 'synchronization' | 'deliveryFailures' | 'security' | 'dailySales' | 'stockAlerts' | 'stockSummary';
interface Settings extends Record<Category, boolean> {
  enabled: boolean; recipient: string; lowStock: number; discrepancyLimit: number;
  closingHour: number; reportHour: number; pendingMinutes: number;
}
interface Job { id: string; to: string; subject: string; status: string; createdAt: string; error?: string }
interface MailStatus { configured: boolean; from: string; settings: Settings; jobs: Job[]; attention: number; monitor: { lastCheck?: string; lastError?: string } }
const choices: [Category, string][] = [
  ['closing', 'Informe de cierre de caja'], ['discrepancy', 'Descuadre de caja'], ['unclosed', 'Caja pendiente de cierre'],
  ['pending', 'Operación pendiente o pedido cobrado sin preparar'], ['synchronization', 'Fallo persistente de comprobación de Shopify'],
  ['deliveryFailures', 'Fallo al enviar documentos al cliente'], ['security', 'Cambio de credenciales o configuración del correo'],
  ['dailySales', 'Resumen diario de ventas del TPV'], ['stockAlerts', 'Stock bajo, agotado o negativo'], ['stockSummary', 'Resumen diario de reposición'],
];
const statuses: Record<string, string> = { queued: 'En cola', sending: 'Enviando', sent: 'Aceptado por el servidor de correo', failed: 'No enviado', unknown: 'Sin confirmación', cancelled: 'Cancelado' };

export function MailPage() {
  const [info, setInfo] = useState<MailStatus | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() { setInfo(await apiGet<MailStatus>('/mail')); }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiGet<MailStatus>('/mail');
        if (active) { setInfo(result); setDraft(previous => previous || result.settings); }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar el correo'); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la acción'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <h2 className="text-lg font-semibold">Correos y avisos</h2>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!info || !draft ? <p>Cargando configuración…</p> : <>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Envío propio</h2>
        <p className="text-sm">{info.configured ? `Remitente: ${info.from}` : 'Falta configurar la cuenta de correo en el servidor. Los envíos están desactivados.'}</p>
        <p className="text-sm text-muted-foreground">Los tickets normales y los vales mantienen su envío mediante Shopify. Aquí se gestionan el ticket regalo y los avisos propios del TPV.</p>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void action(async () => { setDraft(await apiPost<Settings>('/mail/settings', draft)); setNotice('Configuración guardada.'); }); }}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} disabled={!info.configured} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Activar los correos del TPV</label>
            <div><label htmlFor="mail-recipient" className="mb-1 block text-sm font-medium">Correo para avisos internos</label>
              <Input id="mail-recipient" type="email" value={draft.recipient} onChange={event => setDraft({ ...draft, recipient: event.target.value })} placeholder="Correo de compras o responsable" /></div>
            <div className="grid gap-3 sm:grid-cols-2">{choices.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} />{label}</label>)}</div>
            <p className="text-xs text-muted-foreground">Activa los avisos de stock solo si quieres gestionarlos aquí. Si ya llegan desde Shopify, deja estas opciones desmarcadas para evitar duplicados. El stock corresponde al total de todas las ubicaciones; se comprueba cada 15 minutos.</p>
            <div className="grid gap-3 sm:grid-cols-2">{([
              ['lowStock', 'Avisar con estas unidades o menos', 0, 1000, 1],
              ['discrepancyLimit', 'Avisar si el descuadre supera (€)', 0, 10000, 0.01],
              ['closingHour', 'Hora prevista de cierre (0–23)', 0, 23, 1],
              ['reportHour', 'Hora de los resúmenes (0–23)', 0, 23, 1],
              ['pendingMinutes', 'Minutos antes de avisar de una operación pendiente', 1, 1440, 1],
            ] as const).map(([key, label, min, max, step]) => <div key={key}><label htmlFor={`mail-${key}`} className="mb-1 block text-sm">{label}</label><Input id={`mail-${key}`} type="number" required min={min} max={max} step={step} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></div>)}</div>
            <p className="text-xs text-muted-foreground">Horario de Madrid. El resumen de ventas recoge el día anterior completo. Los informes comienzan desde la activación; no se envían cierres históricos.</p>
            <Button type="submit">{busy ? 'Guardando…' : 'Guardar configuración'}</Button>
          </fieldset>
        </form>
        <Button variant="outline" disabled={busy || !info.configured || !info.settings.enabled} onClick={() => void action(async () => { await apiPost('/mail/test'); setNotice('Correo de prueba en cola. Puedes seguir su estado abajo.'); })}>Enviar prueba al correo de avisos guardado</Button>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Últimos envíos {info.attention > 0 && `· ${info.attention} necesitan revisión`}</h2><Button variant="outline" disabled={busy} onClick={() => void action(refresh)}>Actualizar</Button></div>
        {info.monitor.lastError && <p role="alert" className="text-sm text-destructive">{info.monitor.lastError}</p>}
        {info.monitor.lastCheck && <p className="text-xs text-muted-foreground">Última comprobación: {new Date(info.monitor.lastCheck).toLocaleString('es-ES')}</p>}
        <p className="text-xs text-muted-foreground">«Aceptado» significa que el servidor de correo recibió el mensaje, no que el destinatario lo haya leído o que haya llegado a su bandeja de entrada.</p>
        {!info.jobs.length && <p className="text-sm text-muted-foreground">Todavía no hay envíos propios.</p>}
        {info.jobs.map(job => <article key={job.id} className="space-y-2 rounded-lg border bg-white p-3">
          <div className="font-medium">{job.subject}</div><div className="break-all text-sm">{job.to}</div>
          <div className="text-sm">{statuses[job.status] || job.status} · {new Date(job.createdAt).toLocaleString('es-ES')}</div>
          {job.error && <p className="text-sm text-destructive">{job.error}</p>}
          {['failed', 'unknown'].includes(job.status) && <Button variant="outline" disabled={busy || !info.settings.enabled} onClick={() => {
            if (job.status === 'unknown' && !window.confirm('El correo pudo haberse enviado. Comprueba primero si llegó. ¿Quieres reenviarlo aunque pueda duplicarse?')) return;
            void action(async () => { await apiPost(`/mail/${job.id}/retry`, { confirmUnknown: job.status === 'unknown' }); setNotice('Correo puesto de nuevo en cola.'); });
          }}>Reintentar envío</Button>}
        </article>)}
      </section>
    </>}
  </div>;
}
