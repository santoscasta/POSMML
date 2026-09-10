import { escapeHtml, printDocument, thermalStyles } from '../../utils/print';
import { useState } from 'react';
import { formatCurrency } from '../../utils/currency';
import { apiGet, apiPost } from '../../utils/apiClient';
import type { PaymentMethod, MixedPaymentSplit } from '../../types/payment';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, Banknote, CreditCard, Smartphone, Ticket, Shuffle, Search, Loader2, Printer, Mail, X, Gift } from 'lucide-react';

type MixedMethod = Exclude<PaymentMethod, 'MIXED'>;

interface VoucherInfo {
  id: string;
  code: string;
  currentBalance: number;
  status: string;
}

interface CartItemInfo {
  title: string;
  variantTitle: string;
  quantity: number;
  price: number;
}

interface CheckoutModalProps {
  open: boolean;
  total: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  itemCount: number;
  items: CartItemInfo[];
  customerEmail?: string;
  onConfirm: (
    method: PaymentMethod,
    cashReceived?: number,
    mixedSplits?: MixedPaymentSplit[],
    voucherCode?: string,
  ) => Promise<string | null>;
  onClose: () => void;
  pending?: boolean;
  checkoutError?: string | null;
  onResume?: () => Promise<string | null>;
}

export function CheckoutModal({
  open,
  total,
  subtotal,
  taxAmount,
  discountAmount,
  itemCount,
  items,
  customerEmail,
  onConfirm,
  onClose,
  pending,
  checkoutError,
  onResume,
}: CheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [mixedSplits, setMixedSplits] = useState<
    { method: MixedMethod; amount: string; voucherCode?: string }[]
  >([
    { method: 'CASH', amount: '' },
    { method: 'CARD', amount: '' },
  ]);

  // Voucher state
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherInfo, setVoucherInfo] = useState<VoucherInfo | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState(customerEmail || '');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  if (!open) return null;

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum - total;

  const mixedTotal = mixedSplits.reduce(
    (sum, s) => sum + (parseFloat(s.amount) || 0),
    0,
  );
  const mixedValid = Math.round(mixedTotal * 100) === Math.round(total * 100)
    && mixedSplits.every(s => Number(s.amount) > 0 && (s.method !== 'VOUCHER' || !!s.voucherCode?.trim()));

  const voucherCoversTotal = voucherInfo ? voucherInfo.currentBalance >= total : false;

  const canConfirm = (() => {
    if (!method || loading || pending) return false;
    if (method === 'CASH') return cashReceivedNum >= total;
    if (method === 'MIXED') return mixedValid;
    if (method === 'VOUCHER') return voucherInfo !== null && voucherInfo.status === 'ACTIVE' && voucherInfo.currentBalance > 0;
    return true;
  })();

  const handleCheckVoucher = async () => {
    if (!voucherCode.trim()) return;
    setVoucherLoading(true);
    setVoucherError(null);
    setVoucherInfo(null);
    try {
      const info = await apiGet<VoucherInfo>(`/vouchers/${voucherCode.trim()}`);
      if (info.status !== 'ACTIVE') {
        setVoucherError('Este vale no está activo');
      } else if (info.currentBalance <= 0) {
        setVoucherError('Este vale no tiene saldo');
      } else {
        setVoucherInfo(info);
      }
    } catch {
      setVoucherError('Vale no encontrado');
    } finally {
      setVoucherLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!method || loading || pending) return;
    setLoading(true);
    setError(null);

    let splits: MixedPaymentSplit[] | undefined;
    if (method === 'MIXED') {
      splits = mixedSplits.map((s) => ({
        method: s.method,
        amount: parseFloat(s.amount) || 0,
        ...(s.method === 'VOUCHER' ? { voucherCode: s.voucherCode?.trim() } : {}),
      }));
    }

    // For voucher: if balance doesn't cover total, create a mixed payment (voucher + cash)
    if (method === 'VOUCHER' && voucherInfo && !voucherCoversTotal) {
      splits = [
        { method: 'VOUCHER', amount: voucherInfo.currentBalance, voucherCode: voucherInfo.code } as MixedPaymentSplit & { voucherCode: string },
        { method: 'CASH', amount: total - voucherInfo.currentBalance },
      ];
      const orderName = await onConfirm('MIXED', undefined, splits, voucherInfo.code);
      setLoading(false);
      if (orderName) {
        setSuccessOrder(orderName);
      } else {
        setError('Error al procesar el pago');
      }
      return;
    }

    const orderName = await onConfirm(
      method,
      method === 'CASH' ? cashReceivedNum : undefined,
      splits,
      method === 'VOUCHER' && voucherInfo ? voucherInfo.code : undefined,
    );

    setLoading(false);
    if (orderName) {
      setSuccessOrder(orderName);
    } else {
      setError('Error al procesar el pago');
    }
  };

  const handleClose = () => {
    if (loading) return;
    setMethod(null);
    setCashReceived('');
    setMixedSplits([{ method: 'CASH', amount: '' }, { method: 'CARD', amount: '' }]);
    setVoucherCode('');
    setVoucherInfo(null);
    setVoucherError(null);
    setError(null);
    setSuccessOrder(null);
    onClose();
  };

  const updateMixedSplit = (index: number, field: 'method' | 'amount' | 'voucherCode', value: string) => {
    setMixedSplits((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, [field]: field === 'method' ? (value as MixedMethod) : value } : s,
      ),
    );
  };

  const methodButtons: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
    { key: 'CASH', label: 'Efectivo', icon: Banknote },
    { key: 'CARD', label: 'Tarjeta', icon: CreditCard },
    { key: 'BIZUM', label: 'Bizum', icon: Smartphone },
    { key: 'VOUCHER', label: 'Vale', icon: Ticket },
    { key: 'MIXED', label: 'Mixto', icon: Shuffle },
  ];

  const mixedMethodOptions: { value: MixedMethod; label: string }[] = [
    { value: 'CASH', label: 'Efectivo' },
    { value: 'CARD', label: 'Tarjeta' },
    { value: 'BIZUM', label: 'Bizum' },
    { value: 'VOUCHER', label: 'Vale' },
  ];

  return (
    <Dialog open onOpenChange={(openState) => { if (!openState) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {checkoutError && <p role="alert" className="text-sm text-destructive">{checkoutError}</p>}
        {pending && !successOrder && <div className="space-y-2 rounded border p-3">
          <p className="text-sm">Hay un cobro pendiente. Reanúdalo con sus datos originales.</p>
          <Button disabled={loading} onClick={async () => {
            if (!onResume) return;
            setLoading(true);
            const name = await onResume();
            if (name) { setSuccessOrder(name); setError(null); }
            setLoading(false);
          }}>Reanudar cobro pendiente</Button>
        </div>}
        {successOrder ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="size-10 text-success" />
              <div className="text-lg font-semibold">Pedido {successOrder}</div>
              <Badge variant="default" className="bg-success hover:bg-success">Completado</Badge>
              {method === 'CASH' && cashReceivedNum > 0 && (
                <div className="text-sm text-muted-foreground">
                  Cambio: {formatCurrency(change)}
                </div>
              )}
            </div>

            {/* Order summary */}
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Método</span>
                <span>{method === 'CASH' ? 'Efectivo' : method === 'CARD' ? 'Tarjeta' : method === 'BIZUM' ? 'Bizum' : method === 'VOUCHER' ? 'Vale' : 'Mixto'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Artículos</span>
                <span>{itemCount}</span>
              </div>
            </div>

            <Separator />

            {/* Print ticket */}
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const methodLabel = method === 'CASH' ? 'Efectivo' : method === 'CARD' ? 'Tarjeta' : method === 'BIZUM' ? 'Bizum' : method === 'VOUCHER' ? 'Vale' : 'Mixto';
                const printed = printDocument(`<!DOCTYPE html><html><head><title>Ticket ${escapeHtml(successOrder)}</title>
                  <style>${thermalStyles}</style></head><body>
                  <div class="center brand">My mini Leo</div>
                  <div class="center" style="font-size:10px;color:#999">Clothes for your baby</div>
                  <div class="line"></div>
                  <div class="row"><span>Ticket:</span><span class="bold">${escapeHtml(successOrder)}</span></div>
                  <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
                  <div class="row"><span>Método:</span><span>${methodLabel}</span></div>
                  <div class="line"></div>
                  ${items.map(i => `<div class="item"><div class="row"><span>${i.quantity}x ${escapeHtml(i.title)}${i.variantTitle !== 'Default Title' ? ` (${escapeHtml(i.variantTitle)})` : ''}</span></div><div class="row"><span></span><span>${formatCurrency(i.price * i.quantity)}</span></div></div>`).join('')}
                  <div class="line"></div>
                  <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                  ${discountAmount > 0 ? `<div class="row"><span>Descuento</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
                  <div class="row"><span>IVA (21% incl.)</span><span>${formatCurrency(taxAmount)}</span></div>
                  <div class="line"></div>
                  <div class="row total"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
                  ${method === 'CASH' && cashReceivedNum > 0 ? `<div class="row"><span>Recibido</span><span>${formatCurrency(cashReceivedNum)}</span></div><div class="row bold"><span>Cambio</span><span>${formatCurrency(change)}</span></div>` : ''}
                  <div class="line"></div>
                  <div class="footer">Gracias por su compra<br/>myminileo.com</div>
                </body></html>`);
                if (!printed) window.alert('Permite las ventanas emergentes para imprimir el ticket.');
              }}
            >
              <Printer className="size-4" />
              Imprimir ticket
            </Button>

            {/* Print gift ticket (no prices) */}
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const printed = printDocument(`<!DOCTYPE html><html><head><title>Ticket Regalo ${escapeHtml(successOrder)}</title>
                  <style>${thermalStyles}</style></head><body>
                  <div class="center brand">My mini Leo</div>
                  <div class="center" style="font-size:10px;color:#999">Clothes for your baby</div>
                  <div class="line"></div>
                  <div class="gift-label">🎁 Ticket Regalo</div>
                  <div class="line"></div>
                  <div class="row"><span>Ticket:</span><span class="bold">${escapeHtml(successOrder)}</span></div>
                  <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
                  <div class="line"></div>
                  ${items.map(i => `<div class="item"><div class="row"><span>${i.quantity}x ${escapeHtml(i.title)}${i.variantTitle !== 'Default Title' ? ` (${escapeHtml(i.variantTitle)})` : ''}</span></div></div>`).join('')}
                  <div class="line"></div>
                  <div class="center" style="font-size:11px;margin:8px 0">Artículos: ${itemCount}</div>
                  <div class="line"></div>
                  <div class="footer">Este ticket no incluye precios.<br/>Para cambios o devoluciones, presente este ticket.<br/><br/>myminileo.com</div>
                </body></html>`);
                if (!printed) window.alert('Permite las ventanas emergentes para imprimir el ticket.');
              }}
            >
              <Gift className="size-4" />
              Imprimir ticket regalo
            </Button>

            {/* Email ticket */}
            <p className="text-xs text-muted-foreground">Enviar documento del pedido mediante Shopify</p>
            {emailError && <p role="alert" className="text-sm text-destructive">{emailError}</p>}
            {!emailSent ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Email del cliente"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    aria-label="Enviar ticket por correo"
                    disabled={!emailTo.includes('@') || emailSending}
                    onClick={async () => {
                      setEmailSending(true);
                      setEmailError(null);
                      try {
                        await apiPost('/send-receipt', { order: successOrder, email: emailTo.trim() });
                        setEmailSent(true);
                      } catch {
                        setEmailError('No se ha enviado el ticket. Puedes imprimirlo o volver a intentarlo.');
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                  >
                    {emailSending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-sm bg-success/10 px-3 py-2 text-sm text-success">
                <Mail className="size-4" />
                Ticket enviado a {emailTo}
              </div>
            )}

            <Button className="w-full" onClick={handleClose}>
              <X className="size-4" />
              Cerrar y siguiente venta
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Resumen de pago</DialogTitle>
            </DialogHeader>

            <fieldset disabled={loading || pending} className="space-y-4">
              {/* Order summary */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Cantidad</span>
                  <span>{itemCount} artículos</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Impuestos (IVA)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Payment methods */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Seleccionar método de pago</p>
                <div className="grid grid-cols-3 gap-2">
                  {methodButtons.map((btn) => {
                    const Icon = btn.icon;
                    return (
                      <Button
                        key={btn.key}
                        variant={method === btn.key ? 'default' : 'outline'}
                        className="flex-col gap-1 py-3"
                        onClick={() => {
                          setMethod(btn.key);
                          setVoucherInfo(null);
                          setVoucherError(null);
                          setVoucherCode('');
                        }}
                      >
                        <Icon className="size-4" />
                        <span className="text-xs">{btn.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Cash input */}
              {method === 'CASH' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cashReceived">
                    Efectivo recibido
                  </label>
                  <Input
                    id="cashReceived"
                    type="number"
                    min={0}
                    step="0.01"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    autoFocus
                  />
                  {cashReceivedNum >= total && (
                    <div className="flex items-center justify-between rounded-sm bg-success/10 px-3 py-2">
                      <span className="text-sm">Cambio a devolver</span>
                      <span className="text-lg font-bold text-success">
                        {formatCurrency(change)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Voucher input */}
              {method === 'VOUCHER' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Código del vale</label>
                  <div className="flex gap-2">
                    <Input
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                      placeholder="Últimos 4 caracteres"
                      onKeyDown={(e) => e.key === 'Enter' && handleCheckVoucher()}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      onClick={handleCheckVoucher}
                      disabled={voucherLoading || !voucherCode.trim()}
                    >
                      {voucherLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    </Button>
                  </div>

                  {voucherError && (
                    <div className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {voucherError}
                    </div>
                  )}

                  {voucherInfo && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">{voucherInfo.code}</span>
                        <Badge variant="default">Activo</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Saldo disponible</span>
                        <span className="text-lg font-bold text-success">
                          {formatCurrency(voucherInfo.currentBalance)}
                        </span>
                      </div>
                      {!voucherCoversTotal && (
                        <div className="rounded-sm bg-accent/10 px-3 py-2 text-xs text-foreground">
                          El vale cubre {formatCurrency(voucherInfo.currentBalance)} de {formatCurrency(total)}.
                          Resto a pagar en efectivo: {formatCurrency(total - voucherInfo.currentBalance)}
                        </div>
                      )}
                      {voucherCoversTotal && (
                        <div className="rounded-sm bg-success/10 px-3 py-2 text-xs text-success">
                          El vale cubre el total del pedido
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mixed payment */}
              {method === 'MIXED' && (
                <div className="space-y-2">
                  {mixedSplits.map((split, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        title="Método de pago"
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                        value={split.method}
                        onChange={(e) => updateMixedSplit(index, 'method', e.target.value)}
                      >
                        {mixedMethodOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={split.amount}
                        onChange={(e) => updateMixedSplit(index, 'amount', e.target.value)}
                      />
                      {split.method === 'VOUCHER' && <Input
                        aria-label={`Código del vale ${index + 1}`}
                        placeholder="Código del vale"
                        value={split.voucherCode || ''}
                        onChange={e => updateMixedSplit(index, 'voucherCode', e.target.value)}
                      />}
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span>Total parciales</span>
                    <span className={cn(!mixedValid && 'text-destructive')}>
                      {formatCurrency(mixedTotal)} / {formatCurrency(total)}
                    </span>
                  </div>
                  {!mixedValid && mixedTotal > 0 && (
                    <div className={cn(
                      'rounded-sm px-3 py-2 text-xs font-medium',
                      mixedTotal > total
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-accent/10 text-accent-foreground'
                    )}>
                      {mixedTotal > total
                        ? `Te pasas ${formatCurrency(mixedTotal - total)}. Reduce las cantidades para que sumen exactamente ${formatCurrency(total)}.`
                        : `Faltan ${formatCurrency(total - mixedTotal)} por asignar.`
                      }
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </fieldset>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                {loading ? 'Procesando...' : 'Confirmar pago'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
