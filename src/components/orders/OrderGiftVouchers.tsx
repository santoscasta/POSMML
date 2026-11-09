import { useEffect, useRef, useState } from 'react';
import { Printer, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { printDocument } from '../../utils/print';
import { voucherReceipt } from '../../utils/voucherReceipt';
import type { OrderDetail } from '../../types/order';
import type { Voucher } from '../../types/voucher';

interface IssuedGiftVoucher {
  lineItemId: string;
  unit: number;
  voucher: Voucher;
}

export function OrderGiftVouchers({ order }: { order: OrderDetail }) {
  const items = order.lineItems.edges.map(edge => edge.node).filter(item => !item.isGiftCard && item.title.trim().replace(/\s+/g, ' ').toUpperCase() === 'TARJETA REGALO');
  const hasGiftCards = items.length > 0;
  const [issued, setIssued] = useState<IssuedGiftVoucher[]>([]);
  const [loading, setLoading] = useState(hasGiftCards);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);

  useEffect(() => {
    if (!hasGiftCards) return;
    let cancelled = false;
    apiGet<IssuedGiftVoucher[]>(`/orders/${encodeURIComponent(order.id)}/gift-vouchers`)
      .then(data => { if (!cancelled) { setIssued(data); setLoadFailed(false); setError(''); } })
      .catch(cause => { if (!cancelled) { setLoadFailed(true); setError(cause instanceof Error ? cause.message : 'No se han podido cargar los vales'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [order.id, hasGiftCards, revision]);

  if (!hasGiftCards) return null;
  const canGenerate = !order.cancelledAt && order.displayFinancialStatus === 'PAID' && Number(order.totalRefundedSet.shopMoney.amount) === 0;

  async function print(voucher: Voucher) {
    if (!voucher.fullCode) throw new Error('No se ha podido recuperar el código del vale');
    const printed = await printDocument(voucherReceipt({
      code: voucher.fullCode, amount: voucher.originalAmount, balance: voucher.currentBalance,
      date: new Date(voucher.issuedAt).toLocaleDateString('es-ES'),
      customerName: voucher.customerName, orderName: order.name, title: 'TARJETA REGALO',
    }));
    if (!printed) throw new Error('El vale está generado. Permite las ventanas emergentes y pulsa Imprimir vale para imprimirlo.');
  }

  async function handleVoucher(lineItemId: string, unit: number, existing?: Voucher) {
    if (active.current) return;
    active.current = true;
    setBusy(`${lineItemId}:${unit}`);
    setError('');
    try {
      const voucher = existing || await apiPost<Voucher>('/orders/gift-vouchers', { orderId: order.id, lineItemId, unit });
      if (!existing) setIssued(previous => [...previous.filter(entry => entry.lineItemId !== lineItemId || entry.unit !== unit), { lineItemId, unit, voucher }]);
      await print(voucher);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se ha podido generar o imprimir el vale. Reintenta para recuperar el mismo código.');
    } finally { active.current = false; setBusy(''); }
  }

  return <section className="space-y-3 rounded-lg border p-3" aria-label="Vales de tarjetas regalo">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Ticket className="size-4" />Tarjetas regalo</h3>
    {loading ? <p className="text-sm text-muted-foreground">Comprobando vales…</p> : items.flatMap(item => Array.from({ length: item.quantity }, (_, index) => {
      const unit = index + 1;
      const voucher = issued.find(entry => entry.lineItemId === item.id && entry.unit === unit)?.voucher;
      const key = `${item.id}:${unit}`;
      return <div key={key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="min-w-0 text-sm">
          <p>{item.title}{item.quantity > 1 ? ` · ${unit}/${item.quantity}` : ''} · {formatCurrency(item.originalUnitPriceSet.shopMoney.amount)}</p>
          {voucher && <p className="break-all font-mono text-xs text-muted-foreground">{voucher.code} · {voucher.status === 'CANCELLED' ? 'Cancelado' : voucher.status === 'EXHAUSTED' ? 'Agotado' : `Saldo: ${formatCurrency(voucher.currentBalance)}`}</p>}
        </div>
        <Button variant="outline" size="sm" disabled={!!busy || loadFailed || (!voucher && !canGenerate) || (voucher && voucher.status !== 'ACTIVE')} onClick={() => void handleVoucher(item.id, unit, voucher)}>
          <Printer className="size-4" />{busy === key ? 'Preparando…' : voucher ? 'Imprimir vale' : 'Generar vale e imprimir'}
        </Button>
      </div>;
    }))}
    {!canGenerate && <p className="text-xs text-muted-foreground">Solo se generan vales de pedidos pagados y sin reembolsos.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loadFailed && <Button size="sm" variant="outline" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Reintentar comprobación</Button>}
  </section>;
}
