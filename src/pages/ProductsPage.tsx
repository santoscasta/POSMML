import { useMemo, useState } from 'react';
import { Package, Pencil, RefreshCw, Search, Plus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '../components/SortableTableHead';
import { ProductEditor } from '../components/products/ProductEditor';
import { ProductViewer } from '../components/products/ProductViewer';
import { CreateProductModal } from '../components/products/CreateProductModal';
import { productSelectClass, productStatusLabels } from '../utils/productManagement';
import { useProducts } from '../hooks/useProducts';
import { formatCurrency } from '../utils/currency';
import { compareSortValues, nextSort, type SortConfig } from '../utils/sort';
import type { Product } from '../types/product';

type SortKey = 'title' | 'status' | 'price' | 'totalInventory';
const pageSize = 30;
function priceValue(product: Product) {
  return product.variants.length ? Math.min(...product.variants.map(variant => Number(variant.price))) : null;
}
function priceLabel(product: Product) {
  const price = priceValue(product);
  if (price === null) return '—';
  return `${product.variants.some(variant => Number(variant.price) !== price) ? 'Desde ' : ''}${formatCurrency(price)}`;
}
function Status({ value }: { value: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${value === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : value === 'DRAFT' ? 'bg-amber-50 text-amber-800' : 'bg-muted text-muted-foreground'}`}>{productStatusLabels[value] || value}</span>;
}
function ProductImage({ product }: { product: Product }) {
  return product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || ''} className="size-12 shrink-0 rounded-md bg-muted object-cover" loading="lazy" /> : <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted"><Package className="size-5 text-muted-foreground" /></div>;
}

export function ProductsPage() {
  const { products, loading, error, retry, searchQuery, setSearchQuery, updateProduct } = useProducts(true, true);
  const [status, setStatus] = useState('all');
  const [stock, setStock] = useState('all');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortConfig<SortKey>>({ key: 'title', direction: 'asc' });
  const [selected, setSelected] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const types = [...new Set(products.map(product => product.productType).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
  const filtered = useMemo(() => products.filter(product =>
    (status === 'all' || product.status === status) &&
    (stock === 'all' || (stock === 'available' ? product.totalInventory > 0 : product.totalInventory <= 0)) &&
    (type === 'all' || product.productType === type)
  ).sort((a, b) => {
    const value = (product: Product) => sort.key === 'price' ? priceValue(product) : sort.key === 'status' ? productStatusLabels[product.status] || product.status : product[sort.key];
    return compareSortValues(value(a), value(b), sort.direction) || a.id.localeCompare(b.id);
  }), [products, status, stock, type, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeSort = (key: SortKey) => { setSort(nextSort(sort, key)); setPage(1); };
  const hasFilters = Boolean(searchQuery || status !== 'all' || stock !== 'all' || type !== 'all');

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold"><Package className="size-5" />Gestión de productos</h1><p className="mt-1 text-sm text-muted-foreground">Consulta el catálogo y actualiza los productos y sus variantes en Shopify.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => { setPage(1); void retry(); }}><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button><Button disabled={loading || Boolean(error)} onClick={() => setCreating(true)}><Plus className="size-4" />Nuevo producto</Button></div>
    </div>
    <section aria-label="Buscar y filtrar productos" className="space-y-4 rounded-xl border bg-white p-4">
      <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar productos" placeholder="Buscar por nombre, marca, SKU, código de barras…" className="pl-9" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setPage(1); }} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">Estado<select className={productSelectClass} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos los estados</option>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-sm">Stock<select className={productSelectClass} value={stock} onChange={event => { setStock(event.target.value); setPage(1); }}><option value="all">Todo el inventario</option><option value="available">Con existencias</option><option value="empty">Agotados</option></select></label>
        <label className="space-y-1 text-sm">Tipo de producto<select className={productSelectClass} value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="all">Todos los tipos</option>{[...new Set([...types, ...(type === 'all' ? [] : [type])])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      {hasFilters && <Button size="sm" variant="ghost" onClick={() => { setSearchQuery(''); setStatus('all'); setStock('all'); setType('all'); setPage(1); }}>Limpiar filtros</Button>}
    </section>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><span>No se ha podido cargar todo el catálogo: {error}</span><Button size="sm" variant="outline" disabled={loading} onClick={() => void retry()}>Reintentar</Button></div>}
    <section aria-label="Catálogo de productos" className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><p role="status" className="text-sm text-muted-foreground">{loading ? `Cargando catálogo… ${products.length} productos cargados` : `${filtered.length} productos${hasFilters ? ' encontrados' : ' en el catálogo'}`}</p><label className="flex items-center gap-2 text-sm md:hidden">Ordenar<select className={`${productSelectClass} w-auto`} value={sort.key} onChange={event => changeSort(event.target.value as SortKey)}><option value="title">Nombre</option><option value="status">Estado</option><option value="price">Precio</option><option value="totalInventory">Stock</option></select><Button size="sm" variant="ghost" aria-label="Invertir orden" onClick={() => changeSort(sort.key)}>{sort.direction === 'asc' ? '↑' : '↓'}</Button></label></div>
      <div className="hidden md:block"><Table>
        <TableHeader><TableRow><SortableTableHead label="Producto" direction={sort.key === 'title' ? sort.direction : undefined} onSort={() => changeSort('title')} /><SortableTableHead label="Estado" direction={sort.key === 'status' ? sort.direction : undefined} onSort={() => changeSort('status')} /><TableHead>Marca / tipo</TableHead><SortableTableHead label="Precio" direction={sort.key === 'price' ? sort.direction : undefined} onSort={() => changeSort('price')} /><SortableTableHead label="Stock" direction={sort.key === 'totalInventory' ? sort.direction : undefined} onSort={() => changeSort('totalInventory')} /><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
        <TableBody>{visible.map(product => <TableRow key={product.id}>
          <TableCell><div className="flex items-center gap-3"><ProductImage product={product} /><div className="min-w-0"><p className="max-w-72 whitespace-normal font-medium">{product.title}</p><p className="text-xs text-muted-foreground">{product.variants.length} {product.variants.length === 1 ? 'variante' : 'variantes'}</p></div></div></TableCell>
          <TableCell><Status value={product.status} /></TableCell><TableCell><p className="max-w-40 whitespace-normal">{product.vendor || '—'}</p><p className="max-w-40 whitespace-normal text-xs text-muted-foreground">{product.productType || 'Sin tipo'}</p></TableCell><TableCell>{priceLabel(product)}</TableCell><TableCell className={product.totalInventory <= 0 ? 'text-destructive' : ''}>{product.totalInventory}</TableCell>
          <TableCell><div className="flex items-center gap-2"><Button size="icon-sm" variant="outline" title="Ver producto e historial" aria-label={`Ver ${product.title}`} onClick={() => setViewing(product)}><Eye className="size-4" /></Button><Button size="sm" variant="outline" disabled={loading || Boolean(error)} aria-label={`Editar ${product.title}`} onClick={() => setSelected(product)}><Pencil className="size-3.5" />Editar</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
      <div className="divide-y md:hidden">{visible.map(product => <article key={product.id} className="space-y-3 p-4">
        <div className="flex items-start gap-3"><ProductImage product={product} /><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold">{product.title}</h2><p className="text-xs text-muted-foreground">{[product.vendor, product.productType].filter(Boolean).join(' · ')}</p><div className="mt-1"><Status value={product.status} /></div></div></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><p className="font-medium">{priceLabel(product)}</p><p className={`text-xs ${product.totalInventory <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}>Stock: {product.totalInventory} · {product.variants.length} {product.variants.length === 1 ? 'variante' : 'variantes'}</p></div><div className="flex items-center gap-2"><Button size="icon-sm" variant="outline" title="Ver producto e historial" aria-label={`Ver ${product.title}`} onClick={() => setViewing(product)}><Eye className="size-4" /></Button><Button size="sm" variant="outline" disabled={loading || Boolean(error)} aria-label={`Editar ${product.title}`} onClick={() => setSelected(product)}><Pencil className="size-3.5" />Editar</Button></div></div>
      </article>)}</div>
      {!visible.length && <div className="space-y-2 p-10 text-center text-sm text-muted-foreground"><Package className="mx-auto size-8" /><p>{loading ? 'Cargando productos…' : error ? 'El catálogo no está disponible.' : hasFilters ? 'No hay productos que coincidan con los filtros.' : 'Todavía no hay productos en el catálogo.'}</p></div>}
      {filtered.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"><span className="text-muted-foreground">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}</span><div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>{currentPage} / {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div></div>}
    </section>
    {selected && <ProductEditor key={selected.id} product={selected} onClose={() => setSelected(null)} onUpdate={product => { updateProduct(product); setSelected(product); }} />}
    {viewing && <ProductViewer key={viewing.id} product={viewing} onClose={() => setViewing(null)} />}
    {creating && <CreateProductModal onClose={() => setCreating(false)} onCreated={product => { updateProduct(product); setCreating(false); setSearchQuery(''); setStatus('all'); setStock('all'); setType('all'); setPage(1); setSelected(product); }} />}
  </div>;
}
