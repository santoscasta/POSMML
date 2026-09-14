import { VoucherDelivery } from './VoucherDelivery';
import { useState, useRef } from 'react';
import { apiPost, ApiError } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { PENDING_VOUCHER_KEY, readPendingVoucher, type PendingVoucher } from '../../utils/pendingVoucher';
import type { Voucher, IssueVoucherInput } from '../../types/voucher';

interface IssueVoucherModalProps {
  open: boolean;
  onClose: () => void;
  onIssued: () => void;
}

export function IssueVoucherModal({ open, onClose, onIssued }: IssueVoucherModalProps) {
  const [pending, setPending] = useState<PendingVoucher | null>(() => { try { return readPendingVoucher(); } catch { return null; } });
  const active = useRef(false);
  const [amount, setAmount] = useState(() => pending ? String(pending.input.amount) : '');
  const [customerName, setCustomerName] = useState(pending?.input.customerName || '');
  const [customerEmail, setCustomerEmail] = useState(pending?.input.customerEmail || '');
  const [notes, setNotes] = useState(pending?.input.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdVoucher, setCreatedVoucher] = useState<Voucher | null>(null);

  const handleSubmit = async () => {
    if (active.current) return;
    const parsedAmount = parseFloat(amount);
    if (!pending && (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 0.00001)) {
      setError('Introduce un monto válido');
      return;
    }

    if (!pending && customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setError('Introduce un correo válido');
      return;
    }
    try {
      active.current = true;
      setSubmitting(true);
      setError(null);
      const input: IssueVoucherInput = {
        amount: parsedAmount,
        ...(customerName.trim() && { customerName: customerName.trim() }),
        ...(customerEmail.trim() && { customerEmail: customerEmail.trim() }),
        ...(notes && { notes }),
      };
      const attempt = readPendingVoucher() || pending || { operationId: crypto.randomUUID(), input };
      localStorage.setItem(PENDING_VOUCHER_KEY, JSON.stringify(attempt));
      setPending(attempt);
      const voucher = await apiPost<Voucher & { fullCode?: string }>('/vouchers', { operationId: attempt.operationId, ...attempt.input });
      localStorage.removeItem(PENDING_VOUCHER_KEY);
      setPending(null);
      setCreatedVoucher(voucher);
      onIssued();
    } catch (err) {
      if (err instanceof ApiError && err.safeToRestart) { localStorage.removeItem(PENDING_VOUCHER_KEY); setPending(null); }
      setError(err instanceof Error ? err.message : 'Error al emitir el vale');
    } finally {
      active.current = false;
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    if (!pending) { setAmount(''); setCustomerName(''); setCustomerEmail(''); setNotes(''); }
    setError(null);
    setCreatedVoucher(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Emitir Vale</DialogTitle>
        </DialogHeader>

        {createdVoucher ? (
          <div className="flex flex-col items-center py-4">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-success/10">
              <Check className="size-6 text-success" />
            </div>
            <div className="mb-2 text-base font-semibold">
              Vale emitido exitosamente
            </div>
            <div className="mb-4 max-w-full break-all rounded-lg bg-muted px-3 py-3 font-mono text-xl font-bold tracking-wider text-accent">
              {(createdVoucher as Voucher & { fullCode?: string }).fullCode || createdVoucher.code}
            </div>
            <div className="mb-5 text-lg font-semibold">
              {formatCurrency(createdVoucher.originalAmount)}
            </div>
            <VoucherDelivery voucher={createdVoucher} autoSend />
            <Button onClick={handleClose} className="mt-3 w-full">
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {pending && <p role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">Hay una emisión pendiente. Reanudar conserva el importe y el código originales, también después de recargar.</p>}
            <fieldset disabled={submitting || !!pending} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="voucherAmount">
                  Monto *
                </label>
                <Input
                  id="voucherAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="voucherCustomerName">
                  Nombre del cliente
                </label>
                <Input
                  id="voucherCustomerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="voucherCustomerEmail">
                  Email del cliente
                </label>
                <Input
                  id="voucherCustomerEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Opcional"
                />
                <p className="mt-1 text-xs text-muted-foreground">Si indicas un correo, enviaremos el vale al emitirlo.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="voucherNotes">
                  Notas
                </label>
                <textarea
                  id="voucherNotes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            </fieldset>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || (!pending && !amount)}
              >
                {submitting ? 'Emitiendo...' : pending ? 'Reanudar emisión' : 'Emitir Vale'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
