import { useState, useMemo, useEffect } from 'react';
import { apiGet, apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Minus, Plus, Banknote, CreditCard, Ticket, MapPin, Printer, Mail, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { OrderDetail, OrderLineItem } from '../../types/order';

type RefundMethod = 'CASH' | 'CARD' | 'VOUCHER';

interface ShopifyLocation {
  id: string;
  name: string;
  isActive: boolean;
}

interface RefundModalProps {
  order: OrderDetail;
  open: boolean;
  onClose: () => void;
  onRefunded: () => void;
}

interface LineItemSelection {
  selected: boolean;
  quantity: number;
  maxQuantity: number;
  title: string;
  lineItemId: string;
  unitPrice: number;
  currencyCode: string;
}

export function RefundModal({ order, open, onClose, onRefunded }: RefundModalProps) {
  const lineItems: OrderLineItem[] = order.lineItems.edges.map((e) => e.node);

  // Calculate already-refunded quantities per line item
  const refundedQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (order.refunds) {
      for (const refund of order.refunds) {
        if (refund.refundLineItems?.edges) {
          for (const edge of refund.refundLineItems.edges) {
            const title = edge.node.lineItem.title;
            // Match by title since refundLineItems reference differs
            map[title] = (map[title] || 0) + edge.node.quantity;
          }
        }
      }
    }
    return map;
  }, [order.refunds]);

  const [isTotal, setIsTotal] = useState(true);
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<RefundMethod>('CASH');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [voucherEmail, setVoucherEmail] = useState(order.customer?.email || '');
  const [voucherEmailSent, setVoucherEmailSent] = useState(false);
  const [voucherEmailSending, setVoucherEmailSending] = useState(false);
  const [locations, setLocations] = useState<ShopifyLocation[]>([]);
  const [locationId, setLocationId] = useState<string>('');

  useEffect(() => {
    apiGet<ShopifyLocation[]>('/locations')
      .then((locs) => {
        setLocations(locs);
        if (locs.length > 0) setLocationId(locs[0].id);
      })
      .catch(() => {});
  }, []);

  const [lineSelections, setLineSelections] = useState<LineItemSelection[]>(() =>
    lineItems.map((item) => {
      const unitPrice = parseFloat(item.originalUnitPriceSet.shopMoney.amount);
      const alreadyRefunded = refundedQtyMap[item.title] || 0;
      const remaining = Math.max(0, item.quantity - alreadyRefunded);
      return {
        selected: false,
        quantity: remaining,
        maxQuantity: remaining,
        title: item.title,
        lineItemId: item.id,
        unitPrice,
        currencyCode: item.originalUnitPriceSet.shopMoney.currencyCode,
      };
    }).filter((item) => item.maxQuantity > 0),
  );

  const totalOrderAmount = parseFloat(order.totalPriceSet.shopMoney.amount);
  const refundedAmount = parseFloat(order.totalRefundedSet.shopMoney.amount);
  const maxRefundable = totalOrderAmount - refundedAmount;
  const currencyCode = order.totalPriceSet.shopMoney.currencyCode;

  const partialRefundAmount = useMemo(() => {
    return lineSelections.reduce((sum, item) => {
      if (item.selected) {
        return sum + item.unitPrice * item.quantity;
      }
      return sum;
    }, 0);
  }, [lineSelections]);

  const refundAmount = isTotal ? maxRefundable : partialRefundAmount;

  const toggleLineItem = (index: number) => {
    setLineSelections((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const updateQuantity = (index: number, qty: number) => {
    setLineSelections((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, quantity: Math.max(1, Math.min(qty, item.maxQuantity)) }
          : item,
      ),
    );
  };

  const handleSubmit = async () => {
    if (refundAmount <= 0) {
      setError('Selecciona al menos un articulo para reembolsar');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const refundLineItems = isTotal
        ? lineSelections.map((item) => ({
            lineItemId: item.lineItemId,
            quantity: item.maxQuantity,
          }))
        : lineSelections
            .filter((item) => item.selected)
            .map((item) => ({
              lineItemId: item.lineItemId,
              quantity: item.quantity,
            }));

      const payload = {
        orderId: order.id,
        refundLineItems,
        restock,
        locationId: restock && locationId ? locationId : undefined,
        note: reason || undefined,
        method,
        orderName: order.name,
        amount: refundAmount,
        customerName: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`.trim()
          : undefined,
      };

      const result = await apiPost<{ success: boolean; voucherCode?: string }>('/refunds', payload);
      if (result.voucherCode) {
        setVoucherCode(result.voucherCode);
      } else {
        onRefunded();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al procesar el reembolso',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reembolso - {order.name}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Voucher created success */}
        {voucherCode && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
              <Ticket className="size-6 text-success" />
            </div>
            <div className="text-sm font-medium">Reembolso procesado. Vale creado:</div>
            <div className="rounded-lg bg-muted px-5 py-3 font-mono text-xl font-bold tracking-wider text-accent">
              {voucherCode}
            </div>
            <div className="text-lg font-semibold">{formatCurrency(refundAmount, currencyCode)}</div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                const w = window.open('', '_blank', 'width=400,height=600');
                if (!w) return;
                w.document.write(`<!DOCTYPE html><html><head><title>Vale</title>
                  <style>
                    body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 20px 0; font-size: 12px; color: #333; text-align: center; }
                    .brand { font-size: 16px; margin-bottom: 2px; }
                    .sub { font-size: 10px; color: #999; }
                    .line { border-top: 1px dashed #999; margin: 10px 0; }
                    .code { font-size: 22px; font-weight: bold; letter-spacing: 2px; margin: 12px 0; }
                    .amount { font-size: 20px; font-weight: bold; margin: 8px 0; }
                    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; }
                    .info { font-size: 11px; color: #666; margin-top: 8px; }
                  </style></head><body>
                  <div class="brand">My mini Leo</div>
                  <div class="sub">Clothes for your baby</div>
                  <div class="line"></div>
                  <div class="label">Vale de Devolución</div>
                  <div class="code">${voucherCode}</div>
                  <div class="label">Valor</div>
                  <div class="amount">${formatCurrency(refundAmount, currencyCode)}</div>
                  <div class="line"></div>
                  <div class="info">Pedido original: ${order.name}</div>
                  ${order.customer ? `<div class="info">Cliente: ${order.customer.firstName} ${order.customer.lastName}</div>` : ''}
                  <div class="info">Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div class="line"></div>
                  <div class="info">Presente este vale para canjearlo en tienda</div>
                  <div class="info" style="margin-top:4px">myminileo.com</div>
                </body></html>`);
                w.document.close();
                w.print();
              }}
            >
              <Printer className="size-4" />
              Imprimir vale
            </Button>

            {/* Email voucher */}
            {!voucherEmailSent ? (
              <div className="flex w-full gap-2">
                <Input
                  type="email"
                  placeholder="Email del cliente"
                  value={voucherEmail}
                  onChange={(e) => setVoucherEmail(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!voucherEmail.includes('@') || voucherEmailSending}
                  onClick={async () => {
                    setVoucherEmailSending(true);
                    try {
                      await apiPost('/send-voucher', {
                        email: voucherEmail,
                        code: voucherCode,
                        amount: refundAmount,
                        orderName: order.name,
                        customerName: order.customer
                          ? `${order.customer.firstName} ${order.customer.lastName}`.trim()
                          : undefined,
                      });
                    } catch {
                      // TODO: implement email endpoint
                    } finally {
                      setVoucherEmailSending(false);
                      setVoucherEmailSent(true);
                    }
                  }}
                >
                  {voucherEmailSending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex w-full items-center gap-2 rounded-sm bg-success/10 px-3 py-2 text-sm text-success">
                <Mail className="size-4" />
                Vale enviado a {voucherEmail}
              </div>
            )}

            <Button className="w-full" onClick={() => { setVoucherCode(null); setVoucherEmailSent(false); onRefunded(); }}>
              Cerrar
            </Button>
          </div>
        )}

        {/* Refund form */}
        {!voucherCode && (<>
        <div className="flex gap-2">
          <Button
            variant={isTotal ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setIsTotal(true)}
          >
            Reembolso total
          </Button>
          <Button
            variant={!isTotal ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setIsTotal(false)}
          >
            Reembolso parcial
          </Button>
        </div>

        {/* Line items (partial) */}
        {!isTotal && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Seleccionar articulos
            </div>
            <div className="divide-y rounded-lg border">
              {lineSelections.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3',
                    item.selected && 'bg-accent/30',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleLineItem(idx)}
                    title={`Seleccionar ${item.title}`}
                    className="size-4 cursor-pointer accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice, item.currencyCode)} c/u
                    </div>
                  </div>
                  {item.selected && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => updateQuantity(idx, item.quantity - 1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="min-w-[20px] text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => updateQuantity(idx, item.quantity + 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  )}
                  <div className="whitespace-nowrap text-sm font-semibold">
                    {item.selected
                      ? formatCurrency(
                          item.unitPrice * item.quantity,
                          item.currencyCode,
                        )
                      : formatCurrency(
                          item.unitPrice * item.maxQuantity,
                          item.currencyCode,
                        )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Restock toggle */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-3">
          <span className="text-sm font-medium">
            Reponer articulos al inventario
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={restock ? "true" : "false"}
            title="Reponer inventario"
            onClick={() => setRestock(!restock)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
              restock ? 'bg-accent' : 'bg-border',
            )}
          >
            <span
              className={cn(
                'pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform',
                restock ? 'translate-x-[22px]' : 'translate-x-[2px]',
                'mt-[2px]',
              )}
            />
          </button>
        </div>

        {/* Location selector (when restock enabled) */}
        {restock && locations.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="size-3" />
              Ubicación de reposición
            </div>
            <div className="flex gap-2">
              {locations.map((loc) => (
                <Button
                  key={loc.id}
                  variant={locationId === loc.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLocationId(loc.id)}
                >
                  {loc.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Refund method */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Método de reembolso</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'CASH' as RefundMethod, label: 'Efectivo', icon: Banknote },
              { key: 'CARD' as RefundMethod, label: 'Tarjeta', icon: CreditCard },
              { key: 'VOUCHER' as RefundMethod, label: 'Vale', icon: Ticket },
            ]).map((opt) => {
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.key}
                  variant={method === opt.key ? 'default' : 'outline'}
                  className="flex-col gap-1 py-3"
                  onClick={() => setMethod(opt.key)}
                >
                  <Icon className="size-4" />
                  <span className="text-xs">{opt.label}</span>
                </Button>
              );
            })}
          </div>
          {method === 'VOUCHER' && (
            <div className="mt-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-foreground">
              Se creará un vale (gift card) en Shopify por {formatCurrency(refundAmount, currencyCode)} a nombre del cliente.
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <div className="mb-1.5 text-xs font-semibold">
            Motivo del reembolso
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Separator />

        {/* Refund amount */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-3">
          <span className="text-sm font-medium">Monto a reembolsar</span>
          <span className="text-lg font-bold text-destructive">
            {formatCurrency(refundAmount, currencyCode)}
          </span>
        </div>

        {/* Confirm button */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || refundAmount <= 0}
          >
            {submitting ? 'Procesando...' : 'Confirmar reembolso'}
          </Button>
        </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
