import { saleReceipt } from '../../utils/saleReceipt';
import { printDocument } from '../../utils/print';
import { exchangeReceipt, exchangeVoucherReceipt } from '../../utils/exchangeReceipt';
import { useState, useEffect, useCallback } from 'react';
import { shopifyGraphQL } from '../../utils/graphqlClient';
import { ORDER_DETAIL } from '../../graphql/orders';
import { apiGet, apiPost } from '../../utils/apiClient';
import type { PosPayment } from '../../types/payment';
import { formatCurrency } from '../../utils/currency';
import { ExchangeModal } from './ExchangeModal';
import { RefundModal } from './RefundModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  CreditCard,
  Truck,
  Ban,
  Undo2,
  Ticket,
} from 'lucide-react';
import type { OrderDetail } from '../../types/order';

interface OrderDetailResponse {
  order: OrderDetail;
}

interface OrderDetailModalProps {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

type ExchangeReceiptData = import('../../utils/exchangeReceipt').ExchangeReceiptData;

function financialBadgeVariant(status: string) {
  switch (status) {
    case 'PAID': return 'default' as const;
    case 'PENDING': return 'secondary' as const;
    case 'REFUNDED': return 'destructive' as const;
    case 'PARTIALLY_REFUNDED': return 'destructive' as const;
    default: return 'outline' as const;
  }
}

function fulfillmentBadgeVariant(status: string) {
  switch (status) {
    case 'FULFILLED': return 'default' as const;
    case 'UNFULFILLED': return 'secondary' as const;
    default: return 'outline' as const;
  }
}

function financialLabel(status: string): string {
  switch (status) {
    case 'PAID': return 'Pagado';
    case 'PENDING': return 'Pendiente';
    case 'REFUNDED': return 'Reembolsado';
    case 'PARTIALLY_REFUNDED': return 'Parcialmente reembolsado';
    case 'PARTIALLY_PAID': return 'Parcialmente pagado';
    default: return status;
  }
}

function fulfillmentLabel(status: string): string {
  switch (status) {
    case 'FULFILLED': return 'Completado';
    case 'UNFULFILLED': return 'Sin completar';
    case 'PARTIALLY_FULFILLED': return 'Parcialmente completado';
    default: return status;
  }
}

export function OrderDetailModal({ orderId, open, onClose, onUpdate }: OrderDetailModalProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [payments, setPayments] = useState<PosPayment[]>([]);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const [data, movements] = await Promise.all([
        shopifyGraphQL<OrderDetailResponse>(ORDER_DETAIL, { id }),
        apiGet<PosPayment[]>(`/payments/order/${encodeURIComponent(id)}`),
      ]);
      const cursors = new Set<string>();
      let pageInfo = data.order?.lineItems.pageInfo;
      while (pageInfo?.hasNextPage) {
        const after = pageInfo.endCursor;
        if (!after || cursors.has(after)) throw new Error('No se han podido cargar todos los artículos del pedido');
        cursors.add(after);
        const next = await shopifyGraphQL<OrderDetailResponse>(ORDER_DETAIL, { id, after });
        data.order.lineItems.edges.push(...next.order.lineItems.edges);
        pageInfo = next.order.lineItems.pageInfo;
      }
      setOrder(data.order);
      const receiptByExchange = new Map<string, ExchangeReceiptData>();
      for (const movement of movements) if (movement.exchangeId && movement.exchangeReceipt) receiptByExchange.set(movement.exchangeId, movement.exchangeReceipt);
      const missing = [...new Set(movements.filter(movement => movement.exchangeId && !receiptByExchange.has(movement.exchangeId)).map(movement => movement.exchangeId!))];
      await Promise.all(missing.map(async exchangeId => {
        try { receiptByExchange.set(exchangeId, await apiGet<ExchangeReceiptData>(`/exchanges/${encodeURIComponent(exchangeId)}/receipt`)); }
        catch { /* The buttons keep a retry path and display the server error. */ }
      }));
      setPayments(movements.map(movement => movement.exchangeId && receiptByExchange.has(movement.exchangeId)
        ? { ...movement, exchangeReceipt: receiptByExchange.get(movement.exchangeId) }
        : movement));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el pedido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && orderId) {
      fetchDetail(orderId);
    }
    if (!open) {
      setOrder(null);
      setError(null);
    }
  }, [open, orderId, fetchDetail]);

  const handleMarkPaid = async () => {
    if (!order) return;
    try {
      setActionLoading(true);
      await apiPost('/orders/mark-paid', { orderId: order.id });
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar como pagado');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFulfill = async () => {
    if (!order) return;
    try {
      setActionLoading(true);
      await apiPost('/orders/fulfill', { orderId: order.id });
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar como enviado');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    try {
      setActionLoading(true);
      await apiPost('/orders/cancel', {
        orderId: order.id,
        reason: 'OTHER',
        refund: true,
        restock: true,
      });
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar el pedido');
    } finally {
      setActionLoading(false);
    }
  };

  const currency = order?.totalPriceSet.shopMoney.currencyCode ?? 'EUR';
  const canMarkPaid = order?.displayFinancialStatus === 'PENDING';
  const canFulfill = order?.displayFulfillmentStatus === 'UNFULFILLED';
  const canRefund =
    order?.displayFinancialStatus === 'PAID' ||
    order?.displayFinancialStatus === 'PARTIALLY_PAID' ||
    order?.displayFinancialStatus === 'PARTIALLY_REFUNDED';
  const canCancel = !order?.cancelledAt;

  const lineItems = order?.lineItems.edges.map((e) => e.node) ?? [];
  const refunds = order?.refunds ?? [];

  // Extract POS metafields
  const posMetafields = (() => {
    if (!order?.metafields?.edges) return {};
    const map: Record<string, string> = {};
    for (const edge of order.metafields.edges) {
      map[edge.node.key] = edge.node.value;
    }
    return map;
  })();
  const posPaymentMethod = payments.find(p => p.type === 'sale')?.method || posMetafields.payment_method;
  const posVoucherCode = payments.find(p => p.voucherCode)?.voucherCode || posMetafields.voucher_code;
  const posRefundMethod = payments.find(p => p.type === 'refund')?.method || posMetafields.refund_method;

  const subtotal = parseFloat(order?.subtotalPriceSet.shopMoney.amount ?? '0');
  const discounts = parseFloat(order?.totalDiscountsSet.shopMoney.amount ?? '0');
  const tax = parseFloat(order?.totalTaxSet.shopMoney.amount ?? '0');
  const total = parseFloat(order?.totalPriceSet.shopMoney.amount ?? '0');
  const refunded = parseFloat(order?.totalRefundedSet.shopMoney.amount ?? '0');

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Pedido</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Cargando...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {order && !loading && (
            <>
              {/* Order header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold">{order.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-xl font-bold text-accent">
                  {formatCurrency(total, currency)}
                </div>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant={financialBadgeVariant(order.displayFinancialStatus)}>
                  {financialLabel(order.displayFinancialStatus)}
                </Badge>
                <Badge variant={fulfillmentBadgeVariant(order.displayFulfillmentStatus)}>
                  {fulfillmentLabel(order.displayFulfillmentStatus)}
                </Badge>
                {order.cancelledAt && (
                  <Badge variant="destructive">Cancelado</Badge>
                )}
              </div>

              {/* Tags */}
              {order.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {order.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={tag === 'POS MML' ? 'default' : 'outline'}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* POS Payment info & voucher */}
              {posPaymentMethod && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pago POS
                  </div>
                  <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Método de pago</span>
                      <span className="font-medium">
                        {posPaymentMethod === 'CASH' ? 'Efectivo' : posPaymentMethod === 'CARD' ? 'Tarjeta' : posPaymentMethod === 'BIZUM' ? 'Bizum' : posPaymentMethod === 'VOUCHER' ? 'Vale' : posPaymentMethod === 'MIXED' ? 'Mixto' : posPaymentMethod === 'EXCHANGE' ? 'Cambio de artículos' : posPaymentMethod}
                      </span>
                    </div>
                    {posVoucherCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Vale utilizado</span>
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1">
                          <Ticket className="size-3 text-accent" />
                          <span className="font-mono text-xs font-semibold text-accent">{posVoucherCode}</span>
                        </div>
                      </div>
                    )}
                    {posRefundMethod && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método reembolso</span>
                        <span className="font-medium">
                          {posRefundMethod === 'CASH' ? 'Efectivo' : posRefundMethod === 'CARD' ? 'Tarjeta' : posRefundMethod === 'VOUCHER' ? 'Vale' : posRefundMethod === 'EXCHANGE' ? 'Cambio de artículos' : posRefundMethod}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer */}
              {order.customer && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cliente
                  </div>
                  <div className="text-sm font-medium">
                    {order.customer.firstName} {order.customer.lastName}
                  </div>
                  {order.customer.email && (
                    <div className="text-xs text-muted-foreground">{order.customer.email}</div>
                  )}
                  {order.customer.phone && (
                    <div className="text-xs text-muted-foreground">{order.customer.phone}</div>
                  )}
                </div>
              )}

              {/* Shipping address */}
              {order.shippingAddress && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Direccion de envio
                  </div>
                  <div className="text-sm">
                    {order.shippingAddress.address1}, {order.shippingAddress.city}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {order.shippingAddress.province}, {order.shippingAddress.country} {order.shippingAddress.zip}
                  </div>
                </div>
              )}

              {/* Note */}
              {order.note && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notas
                  </div>
                  <div className="text-sm rounded-lg bg-muted/50 p-2">{order.note}</div>
                </div>
              )}

              <Separator />

              {/* Line items */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Articulos
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">P. Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="text-sm font-medium">{item.title}</div>
                            {item.variant?.title && item.variant.title !== 'Default Title' && (
                              <div className="text-xs text-muted-foreground">{item.variant.title}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right text-xs">
                            {formatCurrency(item.originalUnitPriceSet.shopMoney.amount, currency)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(item.originalTotalSet.shopMoney.amount, currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Price breakdown */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumen
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {discounts > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Descuentos</span>
                      <span className="text-destructive">-{formatCurrency(discounts, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Impuestos</span>
                    <span>{formatCurrency(tax, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(total, currency)}</span>
                  </div>
                  {refunded > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Reembolsado</span>
                      <span>-{formatCurrency(refunded, currency)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Refund history */}
              {refunds.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Historial de reembolsos
                  </div>
                  <div className="divide-y rounded-lg border">
                    {refunds.map((refund) => (
                      <div key={refund.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <div className="font-medium">
                              {formatCurrency(
                                refund.totalRefundedSet.shopMoney.amount,
                                refund.totalRefundedSet.shopMoney.currencyCode,
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(refund.createdAt).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                          {refund.note && (
                            <div className="max-w-[60%] text-right">
                              {refund.note.includes('Vale generado:') ? (
                                <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1">
                                  <Ticket className="size-3 text-accent" />
                                  <span className="font-mono text-xs font-semibold text-accent">
                                    {refund.note.match(/Vale generado: (\S+)/)?.[1] || refund.note}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">{refund.note}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {refund.refundLineItems.edges.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {refund.refundLineItems.edges.map((edge, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                                <span>{edge.node.lineItem.title} x{edge.node.quantity}</span>
                                <span>{formatCurrency(edge.node.subtotalSet.shopMoney.amount, edge.node.subtotalSet.shopMoney.currencyCode)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {payments.some(p => p.exchangeId) && <section className="space-y-2 rounded border p-3 text-sm">
                <h3 className="font-semibold">Cambios vinculados</h3>
                {Array.from(new Map(payments.filter(p => p.exchangeId).map(p => [p.exchangeId, p])).values()).map(p => {
                  const loadReceipt = async (): Promise<ExchangeReceiptData | null> => {
                    try { return p.exchangeReceipt || await apiGet<ExchangeReceiptData>(`/exchanges/${encodeURIComponent(p.exchangeId!)}/receipt`); }
                    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se ha podido recuperar el ticket del cambio'); return null; }
                  };
                  return <div className="space-y-2" key={p.exchangeId}>
                    <p>Pedido original {p.originalOrderName} → Nuevo pedido {p.replacementOrderName}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={async () => { const receipt = await loadReceipt(); if (receipt && !printDocument(exchangeReceipt(receipt))) setError('Permite las ventanas emergentes para imprimir el ticket del cambio'); }}>Imprimir ticket del cambio</Button>
                      <Button variant="outline" onClick={async () => {
                        const receipt = await loadReceipt();
                        if (!receipt) return;
                        if (!receipt.voucher) { setError('Este cambio no generó ningún vale'); return; }
                        if (!printDocument(exchangeVoucherReceipt(receipt))) setError('Permite las ventanas emergentes para imprimir el vale');
                      }}>Imprimir vale del cambio</Button>
                    </div>
                  </div>;
                })}
              </section>}
              {/* Actions */}
              <DialogFooter>
                <div className="flex flex-wrap gap-2 w-full justify-end">
                  <Button variant="outline" onClick={() => {
                    const methods: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum', VOUCHER: 'Vale', MIXED: 'Mixto', EXCHANGE: 'Cambio de artículos' };
                    const printed = printDocument(saleReceipt({
                      order: order.name,
                      date: new Date(order.createdAt).toLocaleString('es-ES'),
                      method: methods[posPaymentMethod] || 'No indicado',
                      items: order.lineItems.edges.map(({ node }) => ({ title: node.title, variantTitle: node.variant?.title || '', quantity: node.quantity, price: 0 })),
                      subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0,
                    }, true));
                    if (!printed) setError('Permite las ventanas emergentes para imprimir el ticket regalo.');
                  }}>
                    <Ticket className="size-4" />Imprimir ticket regalo
                  </Button>
                  {canMarkPaid && (
                    <Button
                      variant="default"
                      onClick={handleMarkPaid}
                      disabled={actionLoading}
                    >
                      <CreditCard className="size-4" />
                      Marcar como pagado
                    </Button>
                  )}
                  {canFulfill && (
                    <Button
                      variant="default"
                      onClick={handleFulfill}
                      disabled={actionLoading}
                    >
                      <Truck className="size-4" />
                      Marcar como enviado
                    </Button>
                  )}
                  {canRefund && <Button variant="outline" disabled={actionLoading} onClick={() => setExchangeOpen(true)}>Cambiar artículos</Button>}
                  {canRefund && (
                    <Button
                      variant="destructive"
                      onClick={() => setRefundOpen(true)}
                      disabled={actionLoading}
                    >
                      <Undo2 className="size-4" />
                      Reembolsar
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={actionLoading}
                    >
                      <Ban className="size-4" />
                      Cancelar pedido
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {exchangeOpen && order && <ExchangeModal order={order} onClose={() => setExchangeOpen(false)} onDone={() => { setExchangeOpen(false); onUpdate(); }} />}
      {refundOpen && order && (
        <RefundModal
          order={order}
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          onRefunded={() => {
            setRefundOpen(false);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
