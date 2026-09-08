import { useState } from 'react';
import { apiGet, apiPost } from '../utils/apiClient';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useSession } from '../context/SessionContext';

interface PendingOperation {
  operationId: string;
  kind: 'checkout' | 'refund';
  input: Record<string, unknown>;
  createdAt: string;
  steps: Record<string, string>;
}

export function PendingOperations() {
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setOpen(true);
    setBusy(true);
    setMessage('');
    try { setOperations(await apiGet('/operations/pending')); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las operaciones'); }
    finally { setBusy(false); }
  }
  async function resume(operation: PendingOperation) {
    setBusy(true);
    setMessage('');
    try {
      const result = await apiPost<{ name?: string; voucherCode?: string }>(operation.kind === 'checkout' ? '/checkout' : '/refunds', {
        operationId: operation.operationId, ...operation.input,
      });
      setMessage(result.voucherCode ? `Devolución completada. Vale: ${result.voucherCode}` : `Operación completada${result.name ? `: pedido ${result.name}` : ''}`);
      setOperations(await apiGet('/operations/pending'));
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo reanudar'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="px-2 text-xs text-muted-foreground hover:text-foreground" onClick={load}>Operaciones pendientes</button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Operaciones pendientes</DialogTitle></DialogHeader>
        <p className="text-sm">Reanudar conserva los datos originales y comprueba lo ya registrado. Puedes recuperar aquí una operación aunque hayas cerrado el navegador.</p>
        {message && <p role="status" className="break-words rounded border p-3 text-sm">{message}</p>}
        {!busy && !operations.length && <p className="text-sm">No hay operaciones pendientes.</p>}
        {operations.map(operation => <div key={operation.operationId} className="space-y-2 rounded border p-3 text-sm">
          <p>{operation.kind === 'checkout' ? 'Cobro' : 'Devolución'} · {new Date(operation.createdAt).toLocaleString('es-ES')}</p>
          <p className="break-all text-xs text-muted-foreground">{operation.operationId}</p>
          <Button disabled={busy} onClick={() => resume(operation)}>Reanudar operación</Button>
        </div>)}
      </DialogContent>
    </Dialog>
  </>;
}
