import { useState } from 'react';
import { useSession } from '../../context/SessionContext';
import { es } from '../../i18n/es';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OpenSessionModalProps {
  open: boolean;
  onClose: () => void;
  required?: boolean;
}

export function OpenSessionModal({ open, onClose, required = false }: OpenSessionModalProps) {
  const { openSession } = useSession();
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [cashierName, setCashierName] = useState<string>('Cajero');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const amount = Number(openingAmount);
    if (openingAmount.trim() === '' || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) {
      setError(es.errors.invalidAmount);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await openSession({
        openingAmount: amount,
        cashierName: cashierName.trim() || 'Cajero',
        notes: notes.trim() || undefined,
      });
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : es.errors.sessionOpenFailed,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpeningAmount('');
    setCashierName('Cajero');
    setNotes('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !required) handleClose(); }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!required}>
        <DialogHeader>
          <DialogTitle>{es.sessions.openSession}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="openingAmount">
              {es.sessions.openingAmount} (€)
            </label>
            <Input
              id="openingAmount"
              type="number"
              min={0}
              step="0.01"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              required
              aria-describedby="openingAmountHelp"
              autoFocus
            />
            <p id="openingAmountHelp" className="mt-1.5 text-xs text-muted-foreground">Introduce el efectivo que hay en caja antes de empezar. Si no hay fondo, indica 0.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="cashierName">
              {es.sessions.cashierName}
            </label>
            <Input
              id="cashierName"
              type="text"
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sessionNotes">
              {es.orders.notes}
            </label>
            <textarea
              id="sessionNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {error && (
            <div className="space-y-2">
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
              {error.toLowerCase().includes('ya hay') && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={loading}
                  onClick={async () => {
                    const amount = Number(openingAmount);
                    if (openingAmount.trim() === '' || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) return;
                    setLoading(true);
                    setError(null);
                    try {
                      await openSession({
                        openingAmount: amount,
                        cashierName: cashierName.trim() || 'Cajero',
                        notes: notes.trim() || undefined,
                        force: true,
                      });
                      handleClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Forzar apertura (cierra la anterior)
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!required && (
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              {es.checkout.cancel}
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? es.pos.loading : es.sessions.openSession}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
