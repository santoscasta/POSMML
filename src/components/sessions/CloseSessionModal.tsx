import { useState } from 'react';
import { useSession, type SessionCloseResult } from '../../context/SessionContext';
import { formatCurrency } from '../../utils/currency';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Printer, CheckCircle2 } from 'lucide-react';

interface CloseSessionModalProps {
  open: boolean;
  onClose: () => void;
}

function methodLabel(m: string) {
  switch (m) {
    case 'CASH': return 'Efectivo';
    case 'CARD': return 'Tarjeta';
    case 'BIZUM': return 'Bizum';
    case 'VOUCHER': return 'Vale';
    case 'MIXED': return 'Mixto';
    default: return m;
  }
}

export function CloseSessionModal({ open, onClose }: CloseSessionModalProps) {
  const { session, closeSession } = useSession();
  const [closingAmount, setClosingAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<SessionCloseResult | null>(null);

  if (!session && !closeResult) return null;

  const kpis = session?.kpis;
  const expectedCash = kpis
    ? (session?.openingAmount ?? 0) + kpis.cashSales - kpis.refunds
    : (session?.openingAmount ?? 0);
  const closingNum = parseFloat(closingAmount) || 0;
  const difference = closingNum - expectedCash;

  const handleConfirm = async () => {
    const amount = parseFloat(closingAmount);
    if (isNaN(amount) || amount < 0) {
      setError(es.errors.invalidAmount);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await closeSession({
        closingAmount: amount,
        notes: notes.trim() || undefined,
      });
      setCloseResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : es.errors.sessionCloseFailed,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setClosingAmount('');
    setNotes('');
    setError(null);
    setCloseResult(null);
    onClose();
  };

  const handlePrintReport = () => {
    const data = closeResult;
    if (!data) return;

    const rKpis = data.kpis;
    const orders = data.orderDetails || [];
    const sales = orders.filter(o => o.type === 'sale');
    const refunds = orders.filter(o => o.type === 'refund');
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const openedAt = data.openedAt ? new Date(data.openedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const rExpected = rKpis ? (data.openingAmount || 0) + (rKpis.cashSales || 0) - (rKpis.refundsCash || rKpis.refunds || 0) : data.openingAmount || 0;
    const rDifference = (data.closingAmount || 0) - rExpected;

    const w = window.open('', '_blank', 'width=420,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Informe Cierre de Caja</title>
      <style>
        body { font-family: 'Courier New', monospace; width: 320px; margin: 0 auto; padding: 20px 0; font-size: 11px; color: #333; }
        .center { text-align: center; }
        .brand { font-size: 16px; margin-bottom: 2px; }
        .title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 8px 0; text-align: center; }
        .line { border-top: 1px dashed #999; margin: 8px 0; }
        .dline { border-top: 2px solid #333; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .bold { font-weight: bold; }
        .section { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #666; margin: 10px 0 4px 0; }
        .order { padding: 2px 0; font-size: 10px; }
        .footer { margin-top: 12px; font-size: 9px; color: #999; text-align: center; }
      </style></head><body>
      <div class="center brand">My mini Leo</div>
      <div class="center" style="font-size:10px;color:#999">Clothes for your baby</div>
      <div class="dline"></div>
      <div class="title">Informe de Cierre de Caja</div>
      <div class="line"></div>
      <div class="row"><span>Cajero/a:</span><span class="bold">${data.cashierName || '—'}</span></div>
      <div class="row"><span>Apertura:</span><span>${openedAt}</span></div>
      <div class="row"><span>Cierre:</span><span>${dateStr}</span></div>
      <div class="line"></div>

      <div class="section">Resumen de ventas</div>
      <div class="row"><span>Fondo de caja</span><span>${formatCurrency(data.openingAmount || 0)}</span></div>
      ${rKpis ? `
      <div class="row"><span>Ventas en efectivo</span><span>${formatCurrency(rKpis.cashSales || 0)}</span></div>
      <div class="row"><span>Ventas con tarjeta</span><span>${formatCurrency(rKpis.cardSales || 0)}</span></div>
      <div class="row"><span>Ventas Bizum</span><span>${formatCurrency(rKpis.bizumSales || 0)}</span></div>
      <div class="row"><span>Ventas con vale</span><span>${formatCurrency(rKpis.voucherSales || 0)}</span></div>
      <div class="line"></div>
      <div class="row bold"><span>Ventas brutas</span><span>${formatCurrency(rKpis.grossSales || 0)}</span></div>
      <div class="row"><span>Reembolsos</span><span>-${formatCurrency(rKpis.refunds || 0)}</span></div>
      <div class="row bold"><span>Nº pedidos</span><span>${rKpis.totalOrders || 0}</span></div>
      ` : ''}
      <div class="dline"></div>

      <div class="section">Arqueo de caja</div>
      <div class="row"><span>Efectivo esperado</span><span>${formatCurrency(rExpected)}</span></div>
      <div class="row"><span>Efectivo contado</span><span>${formatCurrency(data.closingAmount || 0)}</span></div>
      <div class="row bold"><span>Diferencia</span><span style="color:${rDifference >= 0 ? '#16a34a' : '#dc2626'}">${rDifference >= 0 ? '+' : ''}${formatCurrency(rDifference)}</span></div>
      <div class="dline"></div>

      ${sales.length > 0 ? `
      <div class="section">Detalle de ventas (${sales.length})</div>
      ${sales.map(o => `<div class="order"><div class="row"><span>${o.name} · ${methodLabel(o.method)}</span><span>${formatCurrency(o.amount)}</span></div></div>`).join('')}
      <div class="line"></div>
      ` : ''}

      ${refunds.length > 0 ? `
      <div class="section">Reembolsos (${refunds.length})</div>
      ${refunds.map(o => `<div class="order"><div class="row"><span>${o.name} · ${methodLabel(o.method)}${o.voucherCode ? ' · Vale: ' + o.voucherCode : ''}</span><span>-${formatCurrency(o.amount)}</span></div></div>`).join('')}
      <div class="line"></div>
      ` : ''}

      ${data.notes ? `<div class="section">Notas</div><div style="font-size:10px">${data.notes}</div><div class="line"></div>` : ''}

      <div class="footer">Informe generado: ${dateStr}<br/>myminileo.com</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {closeResult ? (
          /* ========== REPORT VIEW ========== */
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="size-10 text-success" />
              <div className="text-lg font-semibold">Caja cerrada</div>
            </div>

            {/* Summary */}
            <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cajero/a</span>
                <span className="font-medium">{closeResult.cashierName || '—'}</span>
              </div>
              {closeResult.kpis && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nº pedidos</span>
                    <span className="font-medium">{closeResult.kpis.totalOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ventas brutas</span>
                    <span className="font-semibold">{formatCurrency(closeResult.kpis.grossSales)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo</span>
                    <span>{formatCurrency(closeResult.kpis.cashSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tarjeta</span>
                    <span>{formatCurrency(closeResult.kpis.cardSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bizum</span>
                    <span>{formatCurrency(closeResult.kpis.bizumSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vale</span>
                    <span>{formatCurrency(closeResult.kpis.voucherSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reembolsos</span>
                    <span className="text-destructive">-{formatCurrency(closeResult.kpis.refunds)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Cash reconciliation */}
            <div className="space-y-1.5 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo esperado</span>
                <span>{formatCurrency(closeResult.expectedAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo contado</span>
                <span>{formatCurrency(closeResult.closingAmount ?? 0)}</span>
              </div>
              <Separator />
              <div className={cn(
                'flex justify-between font-semibold',
                (closeResult.difference ?? 0) >= 0 ? 'text-success' : 'text-destructive'
              )}>
                <span>Diferencia</span>
                <span>
                  {(closeResult.difference ?? 0) >= 0 ? '+' : ''}
                  {formatCurrency(closeResult.difference ?? 0)}
                </span>
              </div>
            </div>

            {/* Order list */}
            {closeResult.orderDetails && closeResult.orderDetails.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pedidos de la sesión ({closeResult.orderDetails.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y rounded-lg border text-xs">
                  {closeResult.orderDetails.map((o, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-semibold">{o.name}</span>
                        <span className="ml-2 text-muted-foreground">{methodLabel(o.method)}</span>
                        {o.type === 'refund' && (
                          <span className="ml-1 text-destructive">(reembolso)</span>
                        )}
                      </div>
                      <span className={cn('font-semibold', o.type === 'refund' ? 'text-destructive' : '')}>
                        {o.type === 'refund' ? '-' : ''}{formatCurrency(o.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <Button className="w-full gap-2" onClick={handlePrintReport}>
              <Printer className="size-4" />
              Imprimir informe
            </Button>
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        ) : (
          /* ========== CLOSE FORM ========== */
          <>
            <DialogHeader>
              <DialogTitle>{es.sessions.closeSession}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Session summary */}
              <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{es.sessions.openingAmount}</span>
                  <span className="font-medium">{formatCurrency(session?.openingAmount ?? 0)}</span>
                </div>
                {kpis && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas en efectivo</span>
                      <span className="font-medium">{formatCurrency(kpis.cashSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas con tarjeta</span>
                      <span className="font-medium">{formatCurrency(kpis.cardSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas Bizum</span>
                      <span className="font-medium">{formatCurrency(kpis.bizumSales)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reembolsos</span>
                      <span className="font-medium">-{formatCurrency(kpis.refunds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas brutas</span>
                      <span className="font-medium">{formatCurrency(kpis.grossSales)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{es.sessions.expectedCash}</span>
                  <span>{formatCurrency(expectedCash)}</span>
                </div>
              </div>

              {/* Closing amount */}
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="closingAmount">
                  {es.sessions.closingAmount} (Efectivo contado)
                </label>
                <Input
                  id="closingAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Difference indicator */}
              {closingAmount !== '' && (
                <div
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium',
                    difference >= 0
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                  )}
                >
                  <span>{es.sessions.difference}</span>
                  <span>
                    {difference >= 0
                      ? `+${formatCurrency(difference)} (${es.sessions.surplus})`
                      : `${formatCurrency(difference)} (${es.sessions.shortage})`}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="closeNotes">
                  {es.orders.notes}
                </label>
                <textarea
                  id="closeNotes"
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
                  {error.toLowerCase().includes('ya cerrada') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={loading}
                      onClick={async () => {
                        const amount = parseFloat(closingAmount);
                        setLoading(true);
                        setError(null);
                        try {
                          const result = await closeSession({
                            closingAmount: isNaN(amount) ? 0 : amount,
                            notes: notes.trim() || undefined,
                            force: true,
                          });
                          setCloseResult(result);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Error');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Forzar cierre
                    </Button>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                {es.checkout.cancel}
              </Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? es.pos.loading : es.sessions.closeSession}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
