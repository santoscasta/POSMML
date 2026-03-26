import { useState } from 'react';
import { apiPost } from '../../utils/apiClient';
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
import type { Voucher, IssueVoucherInput } from '../../types/voucher';

interface IssueVoucherModalProps {
  open: boolean;
  onClose: () => void;
  onIssued: () => void;
}

export function IssueVoucherModal({ open, onClose, onIssued }: IssueVoucherModalProps) {
  const [amount, setAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdVoucher, setCreatedVoucher] = useState<Voucher | null>(null);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Introduce un monto válido');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const input: IssueVoucherInput = {
        amount: parsedAmount,
        ...(customerName && { customerName }),
        ...(customerEmail && { customerEmail }),
        ...(notes && { notes }),
      };
      const voucher = await apiPost<Voucher & { fullCode?: string }>('/vouchers', input);
      setCreatedVoucher(voucher);
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al emitir el vale');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setCustomerName('');
    setCustomerEmail('');
    setNotes('');
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
            <div className="mb-4 rounded-lg bg-muted px-5 py-3 font-mono text-2xl font-bold tracking-wider text-accent">
              {(createdVoucher as Voucher & { fullCode?: string }).fullCode || createdVoucher.code}
            </div>
            <div className="mb-5 text-lg font-semibold">
              {formatCurrency(createdVoucher.originalAmount)}
            </div>
            <Button onClick={handleClose} className="w-full">
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

            <div className="space-y-4">
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !amount}
              >
                {submitting ? 'Emitiendo...' : 'Emitir Vale'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
