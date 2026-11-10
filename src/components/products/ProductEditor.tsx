import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiPost, apiDelete, apiUploadImage } from '../../utils/apiClient';
import type { Product, ProductVariant } from '../../types/product';
import { productSelectClass, productStatusLabels } from '../../utils/productManagement';
import { ProductCategories } from './ProductCategories';
import { ProductInventory } from './ProductInventory';
import { AddVariantForm } from './AddVariantForm';

type ProductDetails = Pick<Product, 'id' | 'title' | 'vendor' | 'productType' | 'tags' | 'status'>;

function VariantEditor({ variant, busy, save, remove }: {
  variant: ProductVariant;
  busy: boolean;
  save: (input: { price: string; sku: string; barcode: string }) => Promise<void>;
  remove?: () => void;
}) {
  const [price, setPrice] = useState(variant.price);
  const [sku, setSku] = useState(variant.sku || '');
  const [barcode, setBarcode] = useState(variant.barcode || '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const changed = price !== variant.price || sku !== (variant.sku || '') || barcode !== (variant.barcode || '');
  return <form className="rounded-lg border p-3" onSubmit={event => {
    event.preventDefault();
    void save({ price, sku, barcode });
  }}>
    <fieldset disabled={busy} className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <strong>{variant.title === 'Default Title' ? 'Variante única' : variant.title}</strong>
        <span className="text-muted-foreground">Stock total: {variant.inventoryQuantity}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">Precio (€)<Input type="number" inputMode="decimal" min="0" max="999999999.99" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} /></label>
        <label className="space-y-1 text-sm">SKU<Input maxLength={255} value={sku} onChange={event => setSku(event.target.value)} /></label>
        <label className="space-y-1 text-sm">Código de barras<Input maxLength={255} value={barcode} onChange={event => setBarcode(event.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">{remove && <Button size="sm" type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)}><Trash2 className="size-4" />Eliminar</Button>}<Button size="sm" type="submit" variant="outline" disabled={!changed || busy}><Save className="size-4" />Guardar variante</Button></div>
      {confirmRemove && <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><p>¿Eliminar la variante «{variant.title}» de Shopify? Esta acción es permanente.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>Conservar</Button><Button type="button" size="sm" variant="destructive" onClick={remove}>Eliminar variante</Button></div></div>}
    </fieldset>
  </form>;
}

export function ProductEditor({ product, onUpdate, onClose }: {
  product: Product;
  onUpdate: (product: Product) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [vendor, setVendor] = useState(product.vendor || '');
  const [productType, setProductType] = useState(product.productType || '');
  const [status, setStatus] = useState(product.status);
  const [tags, setTags] = useState((product.tags || []).join(', '));
  const [description, setDescription] = useState(product.description || '');
  const [categoryIds, setCategoryIds] = useState(product.categoryIds || []);
  const [tab, setTab] = useState('details');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [variantFormKey, setVariantFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = { title, vendor, productType, status, description, categoryIds, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) };
  const changed = title !== product.title || vendor !== (product.vendor || '') || productType !== (product.productType || '') || status !== product.status || description !== (product.description || '') || JSON.stringify(categoryIds) !== JSON.stringify(product.categoryIds || []) || JSON.stringify(input.tags) !== JSON.stringify(product.tags || []);

  async function action(work: () => Promise<void>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); setNotice(message); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se han podido guardar los cambios.'); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-3xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>{product.title}</DialogTitle>
        <DialogDescription>Gestiona los datos, variantes, existencias e imágenes. Los cambios se guardan en Shopify.</DialogDescription>
      </DialogHeader>
      <nav aria-label="Secciones del producto" className="flex flex-wrap gap-2">{[['details', 'Datos'], ['variants', `Variantes (${product.variants.length})`], ['stock', 'Stock'], ['images', 'Imágenes']].map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} disabled={busy} aria-pressed={tab === value} onClick={() => { setTab(value); setError(''); setNotice(''); }}>{label}</Button>)}</nav>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <form hidden={tab !== 'details'} onSubmit={event => {
        event.preventDefault();
        void action(async () => {
          const updated = await apiPost<ProductDetails & Pick<Product, 'description' | 'categoryIds'>>(`/products/${encodeURIComponent(product.id)}`, { ...input, description: description === (product.description || '') ? undefined : description });
          onUpdate({ ...product, ...updated });
          setTitle(updated.title); setVendor(updated.vendor || ''); setProductType(updated.productType || '');
          setStatus(updated.status); setTags((updated.tags || []).join(', '));
          setDescription(updated.description || ''); setCategoryIds(updated.categoryIds || []);
        }, 'Datos del producto guardados.');
      }}>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">Nombre del producto<Input required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Marca / proveedor<Input maxLength={255} value={vendor} onChange={event => setVendor(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Tipo de producto<Input maxLength={255} value={productType} onChange={event => setProductType(event.target.value)} /></label>
          <label className="space-y-1 text-sm sm:col-span-2">Descripción<textarea className="min-h-24 w-full rounded-md border p-3" maxLength={30000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Estado<select className={productSelectClass} value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1 text-sm">Etiquetas<Input value={tags} onChange={event => setTags(event.target.value)} placeholder="Separadas por comas" /></label>
          <div className="sm:col-span-2"><ProductCategories value={categoryIds} onChange={setCategoryIds} disabled={busy} /></div>
          {status !== product.status && <p className="text-sm text-muted-foreground sm:col-span-2">Cambiar el estado también afecta a la disponibilidad del producto en Shopify y en el POS.</p>}
          <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={busy || !changed}><Save className="size-4" />{busy ? 'Guardando…' : 'Guardar datos'}</Button></div>
        </fieldset>
      </form>
      <section hidden={tab !== 'variants'} className="space-y-3 border-t pt-4" aria-label="Variantes del producto">
        <div><h2 className="font-semibold">Variantes ({product.variants.length})</h2><p className="mt-1 text-xs text-muted-foreground">Consulta el stock y edita el precio, SKU y código de barras de cada variante.</p></div>
        <AddVariantForm key={variantFormKey} product={product} busy={busy} save={input => action(async () => {
          const variant = await apiPost<ProductVariant>(`/products/${encodeURIComponent(product.id)}/variants`, input);
          onUpdate({ ...product, variants: [...product.variants, variant] }); setVariantFormKey(value => value + 1);
        }, 'Variante creada. Ya puedes asignarle existencias en Stock.')} />
        {product.variants.map(variant => <VariantEditor key={`${variant.id}:${variant.price}:${variant.sku}:${variant.barcode}`} variant={variant} busy={busy} remove={product.variants.length > 1 ? () => { void action(async () => {
          const result = await apiDelete<{ totalInventory: number }>(`/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variant.id)}`);
          onUpdate({ ...product, totalInventory: result.totalInventory, variants: product.variants.filter(item => item.id !== variant.id) });
        }, 'Variante eliminada.'); } : undefined} save={input => action(async () => {
          const updated = await apiPost<ProductVariant>(`/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variant.id)}`, input);
          onUpdate({ ...product, variants: product.variants.map(item => item.id === updated.id ? updated : item) });
        }, 'Variante guardada.')} />)}
      </section>
      {tab === 'stock' && <ProductInventory product={product} onUpdate={onUpdate} onBusyChange={setBusy} />}
      {tab === 'images' && <section className="space-y-4"><h2 className="font-semibold">Imágenes del producto</h2>
        {product.featuredImage && <img className="max-h-48 max-w-full rounded-lg object-contain" src={product.featuredImage.url} alt={product.featuredImage.altText || product.title} />}
        <form className="space-y-3 rounded-lg border p-3" onSubmit={event => { event.preventDefault(); if (!imageFile) return; void action(async () => { if (imageFile.size > 8 * 1024 * 1024) throw new Error('La imagen debe ocupar como máximo 8 MB.'); await apiUploadImage(`/products/${encodeURIComponent(product.id)}/images/upload`, imageFile); setImageFile(null); }, 'Imagen subida a Shopify. Actualiza el catálogo en unos instantes para verla.'); }}>
          <label className="block space-y-2 text-sm font-medium">Subir fotografía<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => setImageFile(event.target.files?.[0] || null)} /></label><p className="text-xs text-muted-foreground">JPG, PNG o WebP · Hasta 8 MB</p><Button type="submit" disabled={busy || !imageFile}>Subir imagen</Button>
        </form>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void action(async () => { await apiPost(`/products/${encodeURIComponent(product.id)}/images`, { url: imageUrl, alt: product.title }); setImageUrl(''); }, 'Imagen enviada a Shopify. Actualiza el catálogo en unos instantes para verla.'); }}>
          <label className="block space-y-1 text-sm">Añadir imagen desde una URL<Input type="url" pattern="https://.*" required value={imageUrl} disabled={busy} onChange={event => setImageUrl(event.target.value)} placeholder="https://…" /></label><p className="text-xs text-muted-foreground">Utiliza un enlace público a la fotografía. Shopify procesará la imagen y la añadirá a la galería del producto.</p><Button type="submit" disabled={busy || !imageUrl}>Añadir imagen</Button>
        </form>
      </section>}
      <div className="flex justify-end border-t pt-4"><Button variant="outline" disabled={busy} onClick={onClose}>Cerrar</Button></div>
    </DialogContent>
  </Dialog>;
}
