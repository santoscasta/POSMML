import { useEffect, useState } from 'react';
import { Eye, ExternalLink, History, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { productStatusLabels } from '../../utils/productManagement';
import type { Product, ProductSnapshot, ProductHistoryPage } from '../../types/product';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid',
  }).format(date);
}

function safeUrl(value: string | null | undefined, shopifyOnly = false): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (shopifyOnly && !/^(admin\.shopify\.com|[a-z0-9-]+\.myshopify\.com)$/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

function StockHistoryLinks({ product }: { product: ProductSnapshot }) {
  const variants = product.variants.filter(variant => safeUrl(variant.inventoryItem.inventoryHistoryUrl, true));
  if (!variants.length) return <p className="text-sm text-muted-foreground">Shopify no facilita un enlace de historial de stock para estas variantes.</p>;
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">Historial de stock por variante ({variants.length})</summary>
    <ul className="mt-3 space-y-2">{variants.map(variant => <li key={variant.id}>
      <a className="inline-flex items-center gap-2 text-sm underline" href={safeUrl(variant.inventoryItem.inventoryHistoryUrl, true)!} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />{variant.title === 'Default Title' ? 'Variante única' : variant.title}{variant.sku ? ` · ${variant.sku}` : ''}
      </a>
    </li>)}</ul>
    <p className="mt-3 text-xs text-muted-foreground">Se abre Shopify en otra pestaña para consultar los movimientos de inventario.</p>
  </details>;
}

const actionLabels: Record<string, string> = {
  create: 'Producto creado', update: 'Producto actualizado', destroy: 'Producto eliminado',
  published: 'Producto publicado', unpublished: 'Publicación retirada', activity: 'Actividad del producto',
};

function ProductActivity({ product }: { product: ProductSnapshot }) {
  const [events, setEvents] = useState<ProductHistoryPage['events']>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const path = `/products/${encodeURIComponent(product.id)}/history`;
  useEffect(() => {
    let live = true;
    void apiGet<ProductHistoryPage>(path + (cursor ? `?after=${encodeURIComponent(cursor)}` : '')).then(data => {
      if (!live) return;
      setEvents(previous => [...new Map([...(cursor ? previous : []), ...data.events].map(event => [event.id, event])).values()]);
      setNextCursor(data.nextCursor); setError('');
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'No se pudo consultar el historial.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, cursor, attempt]);
  return <section className="min-w-0 space-y-4" aria-label="Historial del producto">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Creación en Shopify</p><time className="text-sm font-medium" dateTime={product.createdAt}>{dateLabel(product.createdAt)}</time></div>
      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Última actualización en Shopify</p><time className="text-sm font-medium" dateTime={product.updatedAt}>{dateLabel(product.updatedAt)}</time></div>
    </div>
    <div><h2 className="flex items-center gap-2 font-semibold"><History className="size-4" />Actividad de Shopify</h2>
      <p className="mt-1 text-xs text-muted-foreground">Shopify facilita algunos eventos del producto. El detalle de los movimientos de stock se consulta en el historial de cada variante.</p></div>
    {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><Button size="sm" variant="outline" disabled={loading} onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Reintentar historial</Button></div>}
    {events.length > 0 && <ol className="space-y-3">{events.map(event => <li key={event.id} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{actionLabels[event.action] || 'Actividad del producto'}</h3><time className="text-xs text-muted-foreground" dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time></div>
      <p className="mt-2 break-words text-sm leading-6">{event.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">{[event.author, event.appTitle].filter(Boolean).join(' · ') || 'Shopify'}</p>
    </li>)}</ol>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p>}
    {!loading && !error && !events.length && <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Shopify no devuelve eventos de actividad para este producto. Puedes consultar arriba sus fechas y, debajo, su historial de stock.</p>}
    {!error && nextCursor && <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); setCursor(nextCursor); }}>Cargar más actividad</Button>}
    <StockHistoryLinks product={product} />
  </section>;
}

export function ProductViewer({ product: summary, onClose }: { product: Product; onClose: () => void }) {
  const [product, setProduct] = useState<ProductSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [imageIndex, setImageIndex] = useState(0);
  const path = `/products/${encodeURIComponent(summary.id)}`;
  useEffect(() => {
    let live = true;
    void apiGet<ProductSnapshot>(path).then(data => { if (live) { setProduct(data); setError(''); } })
      .catch(err => { if (live) setError(err instanceof Error ? err.message : 'No se pudo consultar el producto.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, attempt]);
  const images = product?.images.length ? product.images : product?.featuredImage ? [{ ...product.featuredImage, id: 'featured' }] : [];
  const selectedImage = images[imageIndex] || images[0];
  const adminUrl = safeUrl(product?.adminUrl, true), publicUrl = safeUrl(product?.onlineStoreUrl);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-6"><Eye className="size-4 shrink-0" /><span className="break-words">{product?.title || summary.title}</span></DialogTitle>
        <DialogDescription>Consulta del producto · Solo lectura</DialogDescription>
      </DialogHeader>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Cargando ficha del producto…</p>}
      {error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><Button size="sm" variant="outline" disabled={loading} onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Reintentar consulta</Button></div>}
      {product && <>
        <nav aria-label="Consulta del producto" className="flex flex-wrap gap-2">
          <Button size="sm" variant={tab === 'details' ? 'default' : 'outline'} aria-pressed={tab === 'details'} onClick={() => setTab('details')}><Package className="size-4" />Ficha del producto</Button>
          <Button size="sm" variant={tab === 'history' ? 'default' : 'outline'} aria-pressed={tab === 'history'} onClick={() => setTab('history')}><History className="size-4" />Historial</Button>
        </nav>
        {tab === 'details' ? <section className="min-w-0 space-y-5" aria-label="Ficha del producto">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              {selectedImage ? <img src={selectedImage.url} alt={selectedImage.altText || product.title} className="h-64 w-full rounded-lg border bg-muted/30 object-contain" /> : <div className="flex h-48 items-center justify-center rounded-lg border bg-muted/30"><Package className="size-12 text-muted-foreground" /><span className="sr-only">Sin imagen</span></div>}
              {images.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{images.map((image, index) => <button key={image.id} type="button" className={`size-14 shrink-0 overflow-hidden rounded-md border-2 ${imageIndex === index ? 'border-primary' : 'border-transparent'}`} aria-label={`Ver imagen ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}><img src={image.url} alt="" loading="lazy" className="size-full object-cover" /></button>)}</div>}
            </div>
            <div className="min-w-0 space-y-4">
              <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium">{productStatusLabels[product.status] || product.status}</span>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Marca / proveedor</dt><dd className="break-words font-medium">{product.vendor || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tipo de producto</dt><dd className="break-words font-medium">{product.productType || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Stock total</dt><dd className="font-medium">{product.totalInventory}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Variantes</dt><dd className="font-medium">{product.variants.length}</dd></div>
              </dl>
              <div><h2 className="text-xs text-muted-foreground">Categorías</h2><p className="mt-1 break-words text-sm">{product.categories.map(category => category.displayName).join(' · ') || 'Sin categorías'}</p></div>
              <div><h2 className="text-xs text-muted-foreground">Etiquetas</h2><div className="mt-1 flex flex-wrap gap-1">{product.tags?.length ? product.tags.map(tag => <span key={tag} className="max-w-full break-words rounded bg-muted px-2 py-1 text-xs">{tag}</span>) : <p className="text-sm">Sin etiquetas</p>}</div></div>
              <div className="flex flex-wrap gap-3 text-sm">{adminUrl && <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink className="size-3.5" />Ver en Shopify</a>}{publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink className="size-3.5" />Ver en la tienda</a>}</div>
            </div>
          </div>
          <div><h2 className="mb-2 font-semibold">Descripción</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{product.description || 'Sin descripción'}</p></div>
          <section className="min-w-0 space-y-2" aria-label="Variantes en consulta">
            <h2 className="font-semibold">Variantes y existencias</h2>
            <Table className="min-w-[640px]"><TableHeader><TableRow><TableHead>Variante</TableHead><TableHead>Precio</TableHead><TableHead>SKU</TableHead><TableHead>Código de barras</TableHead><TableHead>Stock</TableHead><TableHead>Historial de stock</TableHead></TableRow></TableHeader>
              <TableBody>{product.variants.map(variant => <TableRow key={variant.id}>
                <TableCell className="max-w-48 whitespace-normal break-words">{variant.title === 'Default Title' ? 'Variante única' : variant.title}</TableCell><TableCell>{formatCurrency(variant.price)}</TableCell><TableCell>{variant.sku || '—'}</TableCell><TableCell>{variant.barcode || '—'}</TableCell><TableCell>{variant.inventoryQuantity}</TableCell><TableCell>{safeUrl(variant.inventoryItem.inventoryHistoryUrl, true) ? <a className="inline-flex items-center gap-1 underline" href={safeUrl(variant.inventoryItem.inventoryHistoryUrl, true)!} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" />Consultar</a> : '—'}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </section>
        </section> : <ProductActivity product={product} />}
      </>}
      <div className="flex justify-end border-t pt-4"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
    </DialogContent>
  </Dialog>;
}
