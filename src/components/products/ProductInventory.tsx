import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost } from '../../utils/apiClient';
import { productSelectClass } from '../../utils/productManagement';
import type { Product } from '../../types/product';

interface Inventory {
  tracked: boolean;
  totalInventory: number;
  inventoryQuantity: number;
  locations: { id: string; name: string; quantity: number | null }[];
}
function LocationStock({ location, disabled, save }: { location: Inventory['locations'][number]; disabled: boolean; save: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(String(location.quantity ?? 0));
  return <form className="flex flex-wrap items-end gap-3 rounded-lg border p-3" onSubmit={event => { event.preventDefault(); save(Number(quantity)); }}>
    <label className="min-w-0 flex-1 space-y-1 text-sm"><strong className="break-words">{location.name}</strong><span className="block text-xs text-muted-foreground">{location.quantity === null ? 'Sin existencias asignadas' : `Disponible ahora: ${location.quantity}`}</span><Input aria-label={`Stock en ${location.name}`} disabled={disabled} type="number" inputMode="numeric" required min="0" max="1000000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
    <Button size="sm" type="submit" disabled={disabled || (location.quantity !== null && Number(quantity) === location.quantity)}>Guardar stock</Button>
  </form>;
}

export function ProductInventory({ product, onUpdate, onBusyChange }: { product: Product; onUpdate: (product: Product) => void; onBusyChange: (busy: boolean) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id || '');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = `/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variantId)}/inventory`;
  const load = useCallback(() => apiGet<Inventory>(path), [path]);
  useEffect(() => {
    let live = true;
    void load().then(data => { if (live) { setInventory(data); setError(''); } }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'No se pudo cargar el stock.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load, attempt]);
  function refresh() { setLoading(true); setInventory(null); setNotice(''); setAttempt(value => value + 1); }
  return <section className="space-y-4">
    <div><h2 className="font-semibold">Stock por ubicación</h2><p className="mt-1 text-xs text-muted-foreground">Introduce el número de unidades disponibles en cada tienda o almacén.</p></div>
    <div className="flex items-end gap-3"><label className="min-w-0 flex-1 space-y-1 text-sm">Variante<select className={productSelectClass} value={variantId} disabled={busy} onChange={event => { setVariantId(event.target.value); setInventory(null); setLoading(true); setError(''); setNotice(''); }}>{product.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.title === 'Default Title' ? 'Variante única' : variant.title}</option>)}</select></label><Button variant="outline" disabled={busy || loading} aria-label="Actualizar stock" onClick={refresh}><RefreshCw className="size-4" /></Button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" className="underline" onClick={refresh}>Actualizar existencias</button></p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p className="text-sm text-muted-foreground">Cargando existencias…</p> : inventory && <>
      {!inventory.tracked && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Activa el seguimiento para gestionar las existencias de esta variante.</p><Button size="sm" disabled={busy} onClick={() => {
        setBusy(true); onBusyChange(true); setError('');
        void apiPost<Inventory>(path.replace(/inventory$/, 'tracking'), {}).then(data => { setInventory(data); setNotice('Seguimiento de inventario activado.'); }).catch(err => setError(err instanceof Error ? err.message : 'No se pudo activar el seguimiento.')).finally(() => { setBusy(false); onBusyChange(false); });
      }}>Activar seguimiento</Button></div>}
      {inventory.locations.map(location => <LocationStock key={`${variantId}:${location.id}:${location.quantity}:${attempt}`} location={location} disabled={busy || !inventory.tracked} save={quantity => {
        setBusy(true); onBusyChange(true); setError(''); setNotice('');
        void apiPost<Inventory>(path, { locationId: location.id, previous: location.quantity, quantity, operationId: crypto.randomUUID() }).then(data => {
          setInventory(data); setNotice(`Stock guardado en ${location.name}.`);
          onUpdate({ ...product, totalInventory: data.totalInventory, variants: product.variants.map(variant => variant.id === variantId ? { ...variant, inventoryQuantity: data.inventoryQuantity } : variant) });
        }).catch(err => { setError(err instanceof Error ? err.message : 'No se pudo guardar el stock.'); }).finally(() => { setBusy(false); onBusyChange(false); });
      }} />)}
      {!inventory.locations.length && <p className="text-sm text-muted-foreground">No hay ubicaciones activas en Shopify.</p>}
    </>}
  </section>;
}
