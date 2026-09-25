import { printDocument } from '../../utils/print';
import { voucherReceipt } from '../../utils/voucherReceipt';
import { VoucherDelivery } from './VoucherDelivery';
import { useState } from 'react';
import { apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Printer, Plus, Minus } from 'lucide-react';
import type { Voucher, VoucherTransaction } from '../../types/voucher';

interface VoucherDetailProps {
  voucher: Voucher | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'ACTIVE': return 'default' as const;
    case 'EXHAUSTED': return 'secondary' as const;
    case 'CANCELLED': return 'destructive' as const;
    default: return 'outline' as const;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Activo';
    case 'EXHAUSTED': return 'Agotado';
    case 'CANCELLED': return 'Cancelado';
    default: return status;
  }
}

function transactionTypeLabel(type: VoucherTransaction['type']): string {
  switch (type) {
    case 'CREDIT': return 'Abono';
    case 'DEBIT': return 'Cargo';
  }
}

function TransactionIcon({ type }: { type: VoucherTransaction['type'] }) {
  const base = 'flex size-6 items-center justify-center rounded-full text-xs font-bold';
  switch (type) {
    case 'CREDIT':
      return <span className={cn(base, 'bg-success/10 text-success')}><Plus className="size-3" /></span>;
    case 'DEBIT':
      return <span className={cn(base, 'bg-orange-100 text-orange-600')}><Minus className="size-3" /></span>;
  }
}

export function VoucherDetail({ voucher, open, onClose, onUpdate }: VoucherDetailProps) {
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!voucher) return null;

  const handleCancel = async () => {
    try {
      setCancelling(true);
      setError(null);
      await apiPost(`/vouchers/${encodeURIComponent(voucher.id)}/cancel`);
      setShowConfirm(false);
      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar el vale');
    } finally {
      setCancelling(false);
    }
  };

  const handlePrint = () => {
    const printed = printDocument(voucherReceipt({
      code: voucher.code, amount: voucher.originalAmount,
      balance: voucher.currentBalance, partialCode: true,
      date: new Date(voucher.issuedAt).toLocaleDateString('es-ES'),
      customerName: voucher.customerName,
    }));
    if (!printed) setError('Permite las ventanas emergentes para imprimir.');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del Vale</DialogTitle>
        </DialogHeader>
        <VoucherDelivery key={voucher.id} voucher={voucher} />

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Code display */}
        <div className="flex flex-col items-center">
          <div className="mb-2 font-mono text-2xl font-bold tracking-wider text-accent">
            {voucher.code}
          </div>
          <Badge variant={statusBadgeVariant(voucher.status)}>
            {statusLabel(voucher.status)}
          </Badge>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              Monto original
            </div>
            <div className="text-xl font-semibold">
              {formatCurrency(voucher.originalAmount)}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              Saldo actual
            </div>
            <div
              className={cn(
                'text-xl font-semibold',
                voucher.currentBalance > 0 ? 'text-success' : 'text-muted-foreground'
              )}
            >
              {formatCurrency(voucher.currentBalance)}
            </div>
          </div>
        </div>

        {/* Customer info */}
        {(voucher.customerName || voucher.customerEmail) && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cliente
            </div>
            {voucher.customerName && <div className="text-sm">{voucher.customerName}</div>}
            {voucher.customerEmail && <div className="text-xs text-muted-foreground">{voucher.customerEmail}</div>}
          </div>
        )}

        {/* Notes */}
        {voucher.notes && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas
            </div>
            <div className="text-sm">{voucher.notes}</div>
          </div>
        )}

        {/* Transaction history */}
        {voucher.transactions && voucher.transactions.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Historial de transacciones
            </div>
            <div className="divide-y rounded-lg border">
              {voucher.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <TransactionIcon type={tx.type} />
                    <div>
                      <div className="font-medium">{transactionTypeLabel(tx.type)}</div>
                      {tx.note && (
                        <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {tx.note}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.processedAt).toLocaleDateString('es-ES', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'font-semibold',
                      tx.type === 'CREDIT' ? 'text-success' : 'text-orange-600'
                    )}
                  >
                    {tx.type === 'DEBIT' ? '-' : '+'}{formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handlePrint}>
            <Printer className="size-4" />
            Imprimir referencia
          </Button>
          {voucher.status === 'ACTIVE' && !showConfirm && (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setShowConfirm(true)}
            >
              Cancelar Vale
            </Button>
          )}
        </div>

        {/* Confirm cancel */}
        {showConfirm && (
          <div className="rounded-lg bg-destructive/10 p-4 text-center">
            <div className="mb-3 text-sm font-medium text-destructive">
              ¿Está seguro de que desea cancelar este vale?
            </div>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
              >
                No, volver
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelando...' : 'Sí, cancelar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
