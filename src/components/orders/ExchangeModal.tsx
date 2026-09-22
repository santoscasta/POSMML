import { useEffect, useRef, useState } from 'react';
import type { OrderDetail } from '../../types/order';
import type { Product } from '../../types/product';
import { useProducts } from '../../hooks/useProducts';
import { apiGet, apiPost, ApiError } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { printDocument, escapeHtml, thermalStyles } from '../../utils/print';
import { useSession } from '../../context/SessionContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface Item { variantId: string; quantity: number; title: string }
interface Quote { token: string; credit: number; total: number; due: number; voucher: number }
interface Attempt { operationId: string; orderId: string; refundLineItems: { lineItemId: string; quantity: number }[]; items: { variantId: string; quantity: number }[]; restock: boolean; locationId?: string; quoteToken: string; method: string; cashReceived?: number }
interface Result { name: string; due: number; change: number; voucher?: { id: string; code: string; amount: number } }
export function ExchangeModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const storageKey = `pos.pending-exchange.v1:${order.id}`;
  const [pending, setPending] = useState<Attempt | null>(() => { const saved = localStorage.getItem(storageKey); return saved ? JSON.parse(saved) : null; });
  const [returns, setReturns] = useState<Record<string, number>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [restock, setRestock] = useState(true);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState('CARD');
  const [cashReceived, setCashReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const { refresh } = useSession();
  const { products, loading, error: productError, setSearchQuery, searchQuery, retry } = useProducts(false);
  useEffect(() => { let alive = true; void apiGet<{ id: string; name: string }[]>('/locations').then(rows => { if (alive) { setLocations(rows); setLocationId(rows[0]?.id || ''); } }).catch(() => { if (alive) setError('No se han podido cargar las ubicaciones de reposición'); }); return () => { alive = false; }; }, []);
  const selectedReturns = Object.entries(returns).filter(([, quantity]) => quantity > 0).map(([lineItemId, quantity]) => ({ lineItemId, quantity }));
  const selection = { orderId: order.id, refundLineItems: selectedReturns, items: items.map(({ variantId, quantity }) => ({ variantId, quantity })), restock, locationId: restock ? locationId : undefined };
  const invalidate = () => { setQuote(null); setError(''); };
  const add = (product: Product, variantId: string, variantTitle: string) => { invalidate(); setItems(previous => { const found = previous.find(i => i.variantId === variantId); return found ? previous.map(i => i.variantId === variantId ? { ...i, quantity: i.quantity + 1 } : i) : [...previous, { variantId, quantity: 1, title: `${product.title}${variantTitle === 'Default Title' ? '' : ` · ${variantTitle}`}` }]; }); };
  async function calculate() {
    if (active.current) return;
    active.current = true; setBusy(true); setError(''); setQuote(null);
    try { setQuote(await apiPost<Quote>('/exchanges/quote', selection)); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo calcular el cambio'); }
    finally { active.current = false; setBusy(false); }
  }
  async function confirm() {
    if (active.current || (!pending && !quote)) return;
    active.current = true; setBusy(true); setError('');
    try {
      const attempt: Attempt = pending || { ...selection, operationId: crypto.randomUUID(), quoteToken: quote!.token, method, ...(method === 'CASH' ? { cashReceived: Number(cashReceived) } : {}) };
      localStorage.setItem(storageKey, JSON.stringify(attempt)); setPending(attempt);
      const completed = await apiPost<Result>('/exchanges', attempt);
      localStorage.removeItem(storageKey); setPending(null); setResult(completed);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.safeToRestart) { localStorage.removeItem(storageKey); setPending(null); setQuote(null); }
      setError(err instanceof Error ? err.message : 'No se pudo completar el cambio');
    } finally { active.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) { if (result) onDone(); else onClose(); } }}>
    <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Cambiar artículos · {order.name}</DialogTitle></DialogHeader>
      {busy && <p role="status" className="text-sm">Procesando cambio…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result ? <div className="space-y-4">
        <p role="status">Cambio completado. Nuevo pedido {result.name}.</p>
        <p>{result.due > 0 ? `Diferencia cobrada: ${formatCurrency(result.due)}` : 'Sin cobro adicional.'}</p>
        {result.change > 0 && <p>Cambio en efectivo: {formatCurrency(result.change)}</p>}
        {result.voucher && <div className="space-y-2 rounded border p-3"><p>Vale por la diferencia: {formatCurrency(result.voucher.amount)}</p><p className="break-all font-mono font-bold">{result.voucher.code}</p>
          <Button variant="outline" onClick={() => { const v = result.voucher!; if (!printDocument(`<html lang="es"><head><title>Vale de cambio</title><style>${thermalStyles}</style></head><body><img class="receipt-logo" src="/logo-myminileo.jpg" alt="My mini Leo"/><h2>Vale de cambio</h2><p class="code">${escapeHtml(v.code)}</p><p>${formatCurrency(v.amount)}</p><p>Pedido original: ${escapeHtml(order.name)}</p><p>Nuevo pedido: ${escapeHtml(result.name)}</p></body></html>`)) setError('Permite las ventanas emergentes para imprimir'); }}>Imprimir vale</Button>
        </div>}
        <Button onClick={onDone}>Cerrar</Button>
      </div> : pending ? <div className="space-y-3"><p role="status">Hay un cambio pendiente. Reanudar conserva los artículos y el pago originales. No vuelvas a cobrar la diferencia.</p><Button disabled={busy} onClick={confirm}>{busy ? 'Procesando…' : 'Reanudar cambio'}</Button></div> : <>
        <fieldset disabled={busy} className="space-y-5">
          <section className="space-y-2"><h3 className="font-semibold">1. Artículos que devuelve</h3>
            {order.lineItems.edges.map(({ node }) => { const refunded = order.refunds.reduce((sum, refund) => sum + refund.refundLineItems.edges.filter(e => e.node.lineItem.id === node.id).reduce((n, e) => n + e.node.quantity, 0), 0); const max = Math.max(0, node.quantity - refunded); return max > 0 && <label key={node.id} className="flex items-center justify-between gap-3 text-sm"><span>{node.title} {node.variant?.title !== 'Default Title' ? node.variant?.title : ''}</span><Input aria-label={`Devolver ${node.title}`} className="w-20 shrink-0" type="number" min={0} max={max} step={1} value={returns[node.id] || 0} onChange={e => { invalidate(); setReturns({ ...returns, [node.id]: Number(e.target.value) }); }} /></label>; })}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={e => { invalidate(); setRestock(e.target.checked); }} />Reponer artículos devueltos</label>
            {restock && <label className="block text-sm">Ubicación de reposición<select className="mt-1 w-full rounded border p-2" value={locationId} onChange={e => { invalidate(); setLocationId(e.target.value); }}><option value="">Selecciona una ubicación</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
          </section>
          <section className="space-y-2"><h3 className="font-semibold">2. Artículos que se lleva</h3>
            <Input aria-label="Buscar artículos para el cambio" placeholder="Buscar producto…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {productError && <p role="alert">{productError} <button type="button" onClick={retry}>Reintentar</button></p>}
            <div className="max-h-44 space-y-1 overflow-y-auto rounded border p-2">{loading ? <p>Cargando productos…</p> : products.slice(0, 30).map(p => <div key={p.id} className="space-y-1">{p.variants.map(v => <Button key={v.id} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => add(p, v.id, v.title)}>{p.title}{v.title !== 'Default Title' ? ` · ${v.title}` : ''} · {formatCurrency(Number(v.price))} · Añadir</Button>)}</div>)}{!loading && !products.length && <p>No se encontraron productos.</p>}</div>
            {products.length > 30 && <p className="text-xs text-muted-foreground">Se muestran los primeros 30 productos. Usa el buscador para encontrar el artículo.</p>}
            {items.map(i => <div key={i.variantId} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.title}</span><Input aria-label={`Cantidad de ${i.title}`} className="w-20" type="number" min={1} step={1} value={i.quantity} onChange={e => { invalidate(); setItems(items.map(row => row.variantId === i.variantId ? { ...row, quantity: Number(e.target.value) } : row)); }} /><Button variant="outline" onClick={() => { invalidate(); setItems(items.filter(row => row.variantId !== i.variantId)); }}>Quitar</Button></div>)}
          </section>
          <Button variant="outline" disabled={!selectedReturns.length || !items.length || (restock && !locationId)} onClick={calculate}>Calcular diferencia</Button>
          {quote && <section className="space-y-3 rounded border bg-muted/30 p-3"><h3 className="font-semibold">3. Confirmar el cambio</h3><p>Valor de la devolución: {formatCurrency(quote.credit)}</p><p>Nuevos artículos: {formatCurrency(quote.total)}</p><p className="font-semibold">{quote.due > 0 ? `A cobrar: ${formatCurrency(quote.due)}` : quote.voucher > 0 ? `Vale a emitir: ${formatCurrency(quote.voucher)}` : 'Mismo importe: sin cobro y sin vale'}</p>
            {quote.due > 0 && <><label className="block text-sm">Método de pago<select className="mt-1 w-full rounded border p-2" value={method} onChange={e => setMethod(e.target.value)}><option value="CARD">Tarjeta</option><option value="CASH">Efectivo</option><option value="BIZUM">Bizum</option></select></label>{method === 'CASH' ? <label className="block text-sm">Efectivo recibido<Input type="number" min={quote.due} step="0.01" value={cashReceived} onChange={e => setCashReceived(e.target.value)} /></label> : <p className="text-sm">Confirma después de cobrar la diferencia por {method === 'CARD' ? 'tarjeta' : 'Bizum'}.</p>}</>}
            <Button disabled={quote.due > 0 && method === 'CASH' && Number(cashReceived) < quote.due} onClick={confirm}>Confirmar cambio</Button>
          </section>}
        </fieldset>
      </>}
    </DialogContent>
  </Dialog>;
}
