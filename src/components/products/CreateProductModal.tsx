import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProductCategories } from './ProductCategories';
import { apiPost, ApiError } from '../../utils/apiClient';
import { productSelectClass, productStatusLabels } from '../../utils/productManagement';
import type { Product } from '../../types/product';

const emptyVariant = () => ({ key: crypto.randomUUID(), name: '', price: '', sku: '', barcode: '' });
const pendingKey = 'pos.products.pending-create.v1';
interface PendingProduct {
  operationId: string; title: string; vendor: string; productType: string; description: string;
  tags: string[]; status: string; categoryIds: string[]; imageUrl: string; optionName: string;
  variants: { name: string; price: string; sku: string; barcode: string }[];
}
function readPending(): PendingProduct | null {
  try {
    const value = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    return value && typeof value.operationId === 'string' && typeof value.title === 'string' && Array.isArray(value.variants) && value.variants.length ? value : null;
  } catch { return null; }
}

export function CreateProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (product: Product) => void }) {
  const [pending] = useState(readPending);
  const [operationId, setOperationId] = useState(() => pending?.operationId || crypto.randomUUID());
  const [title, setTitle] = useState(pending?.title || '');
  const [vendor, setVendor] = useState(pending?.vendor || '');
  const [productType, setProductType] = useState(pending?.productType || '');
  const [description, setDescription] = useState(pending?.description || '');
  const [tags, setTags] = useState((pending?.tags || []).join(', '));
  const [status, setStatus] = useState(pending?.status || 'DRAFT');
  const [categoryIds, setCategoryIds] = useState<string[]>(pending?.categoryIds || []);
  const [imageUrl, setImageUrl] = useState(pending?.imageUrl || '');
  const [optionName, setOptionName] = useState(pending?.optionName || 'Talla');
  const [variants, setVariants] = useState(() => pending ? pending.variants.map(variant => ({ ...variant, key: crypto.randomUUID() })) : [{ ...emptyVariant(), name: 'Única' }]);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(Boolean(pending));
  const [error, setError] = useState(pending ? 'Hay una creación pendiente de confirmar.' : '');
  const updateVariant = (key: string, field: 'name' | 'price' | 'sku' | 'barcode', value: string) => setVariants(current => current.map(variant => variant.key === key ? { ...variant, [field]: value } : variant));
  async function create() {
    setBusy(true); setError('');
    try {
      const input = { operationId, title, vendor, productType, description, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), status, categoryIds, imageUrl, optionName, variants: variants.map(({ name, price, sku, barcode }) => ({ name, price, sku, barcode })) };
      localStorage.setItem(pendingKey, JSON.stringify(input));
      const product = await apiPost<Product>('/products', input);
      localStorage.removeItem(pendingKey);
      onCreated(product);
    } catch (err) {
      const safe = err instanceof ApiError && (err.safeToRestart || err.code === 'INVALID_REQUEST');
      if (safe) { localStorage.removeItem(pendingKey); setOperationId(crypto.randomUUID()); setUncertain(false); }
      else setUncertain(true);
      setError(err instanceof Error ? err.message : 'No se ha podido confirmar la creación.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-3xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>Nuevo producto</DialogTitle><DialogDescription>Añade los datos y las tallas o variantes. Después podrás asignar existencias a cada ubicación.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}{uncertain && ' Pulsa «Comprobar creación» para recuperar el mismo intento.'}</p>}
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void create(); }}>
        <fieldset disabled={busy || uncertain} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">Nombre del producto<Input required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ej. Camiseta de algodón" /></label>
          <label className="space-y-1 text-sm">Marca / proveedor<Input maxLength={255} value={vendor} onChange={event => setVendor(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Tipo de producto<Input maxLength={255} value={productType} onChange={event => setProductType(event.target.value)} placeholder="Ej. Camisetas" /></label>
          <label className="space-y-1 text-sm sm:col-span-2">Descripción<textarea className="min-h-24 w-full rounded-md border p-3" maxLength={30000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Estado<select className={productSelectClass} value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1 text-sm">Etiquetas<Input value={tags} onChange={event => setTags(event.target.value)} placeholder="Separadas por comas" /></label>
          <div className="sm:col-span-2"><ProductCategories value={categoryIds} onChange={setCategoryIds} disabled={busy || uncertain} /></div>
          <label className="space-y-1 text-sm sm:col-span-2">URL de imagen (opcional)<Input type="url" pattern="https://.*" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://…" /><span className="text-xs text-muted-foreground">Enlace público a la fotografía del producto.</span></label>
        </fieldset>
        <fieldset disabled={busy || uncertain} className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Variantes y precios</h2><Button type="button" size="sm" variant="outline" disabled={variants.length >= 100} onClick={() => setVariants(current => [...current, emptyVariant()])}><Plus className="size-4" />Añadir variante</Button></div>
          <label className="block space-y-1 text-sm">Nombre de la opción<Input maxLength={255} required value={optionName} onChange={event => setOptionName(event.target.value)} placeholder="Talla, color o variante" /></label>
          {variants.map((variant, index) => <div key={variant.key} className="space-y-3 rounded-lg border p-3"><div className="flex items-center justify-between"><strong className="text-sm">Variante {index + 1}</strong>{variants.length > 1 && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar variante ${index + 1}`} onClick={() => setVariants(current => current.filter(item => item.key !== variant.key))}><Trash2 className="size-4" /></Button>}</div><div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">{optionName || 'Variante'}<Input required maxLength={255} value={variant.name} onChange={event => updateVariant(variant.key, 'name', event.target.value)} placeholder="Ej. 6 años / Azul" /></label>
            <label className="space-y-1 text-sm">Precio (€)<Input required type="number" inputMode="decimal" min="0" max="999999999.99" step="0.01" value={variant.price} onChange={event => updateVariant(variant.key, 'price', event.target.value)} /></label>
            <label className="space-y-1 text-sm">SKU<Input maxLength={255} value={variant.sku} onChange={event => updateVariant(variant.key, 'sku', event.target.value)} /></label>
            <label className="space-y-1 text-sm">Código de barras<Input maxLength={255} value={variant.barcode} onChange={event => updateVariant(variant.key, 'barcode', event.target.value)} /></label>
          </div></div>)}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Creando…' : uncertain ? 'Comprobar creación' : 'Crear producto'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
