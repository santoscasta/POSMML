import { useState, useEffect, useCallback } from 'react';
import { shopifyGraphQL } from '../../utils/graphqlClient';
import { ORDER_DETAIL } from '../../graphql/orders';
import { apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
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
  const [refundOpen, setRefundOpen] = useState(false);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await shopifyGraphQL<OrderDetailResponse>(ORDER_DETAIL, { id });
      setOrder(data.order);
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
    order?.displayFinancialStatus === 'PARTIALLY_PAID';
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
  const posPaymentMethod = posMetafields.payment_method;
  const posVoucherCode = posMetafields.voucher_code;
  const posRefundMethod = posMetafields.refund_method;

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
                        {posPaymentMethod === 'CASH' ? 'Efectivo' : posPaymentMethod === 'CARD' ? 'Tarjeta' : posPaymentMethod === 'BIZUM' ? 'Bizum' : posPaymentMethod === 'VOUCHER' ? 'Vale' : posPaymentMethod === 'MIXED' ? 'Mixto' : posPaymentMethod}
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
                          {posRefundMethod === 'CASH' ? 'Efectivo' : posRefundMethod === 'CARD' ? 'Tarjeta' : posRefundMethod === 'VOUCHER' ? 'Vale' : posRefundMethod}
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

              {/* Actions */}
              <DialogFooter>
                <div className="flex flex-wrap gap-2 w-full justify-end">
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
