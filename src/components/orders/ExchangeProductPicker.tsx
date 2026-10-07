import { useMemo, useState } from 'react';
import { ArrowLeft, Package } from 'lucide-react';
import { useProducts } from '../../hooks/useProducts';
import { useCategories } from '../../hooks/useCategories';
import { descendantCategoryIds, type CatalogCategory } from '../../utils/categoryTree';
import { formatCurrency } from '../../utils/currency';
import type { Product, ProductVariant } from '../../types/product';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return product.featuredImage?.url && !failed ? <img
    src={product.featuredImage.url}
    alt={product.featuredImage.altText || product.title}
    loading="lazy"
    decoding="async"
    className="aspect-[4/3] w-full rounded-t object-cover"
    onError={() => setFailed(true)}
  /> : <div className="flex aspect-[4/3] items-center justify-center rounded-t bg-muted text-muted-foreground">
    <Package aria-hidden="true" className="size-10" /><span className="sr-only">Sin foto</span>
  </div>;
}

export function ExchangeProductPicker({ onAdd }: { onAdd: (product: Product, variant: ProductVariant) => void }) {
  const { products, loading, error, searchQuery, setSearchQuery, retry } = useProducts(false);
  const catalog = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const categoryOptions = useMemo(() => {
    const options: { category: CatalogCategory; label: string }[] = [];
    function visit(categories: CatalogCategory[], parentLabel = '') {
      for (const category of categories) {
        const label = parentLabel ? `${parentLabel} › ${category.title}` : category.title;
        options.push({ category, label });
        visit(category.children, label);
      }
    }
    visit(catalog.categories);
    return options;
  }, [catalog.categories]);
  const visibleProducts = useMemo(() => {
    const category = categoryOptions.find(option => option.category.id === categoryId)?.category;
    if (!category) return products;
    const ids = descendantCategoryIds(category);
    return products.filter(product => product.categoryIds?.some(id => ids.has(id)));
  }, [products, categoryId, categoryOptions]);

  function selectProduct(product: Product) {
    if (product.variants.length === 1) onAdd(product, product.variants[0]);
    else setSelectedProduct(product);
  }

  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Pulsa la foto de la prenda para añadirla o elegir su talla. También puedes buscar por nombre.</p>
    <Input aria-label="Buscar artículos para el cambio" placeholder="Buscar producto (opcional)…" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setSelectedProduct(null); }} />
    <label className="block space-y-1 text-sm">
      <span>Filtrar por categoría</span>
      <select aria-label="Categoría de artículos para el cambio" className="w-full rounded border bg-background p-2" value={categoryId} disabled={catalog.loading || !!catalog.error} onChange={event => { setCategoryId(event.target.value); setSelectedProduct(null); }}>
        <option value="">{catalog.loading ? 'Cargando categorías…' : 'Todas las categorías'}</option>
        {categoryOptions.map(option => <option key={option.category.id} value={option.category.id}>{option.label}</option>)}
      </select>
    </label>
    {catalog.error && <p role="alert" className="text-sm text-destructive">No se han podido cargar las categorías. Puedes elegir entre todos los productos. <button type="button" className="underline" onClick={catalog.retry}>Reintentar categorías</button></p>}
    {error && <p role="alert" className="text-sm text-destructive">No se ha cargado todo el catálogo: {error} <button type="button" className="underline" onClick={retry}>Reintentar productos</button></p>}
    <div role="region" aria-label="Catálogo visual para el cambio" className="max-h-[45dvh] overflow-y-auto overscroll-contain rounded border p-2">
      {selectedProduct ? <div className="space-y-3">
        <Button type="button" variant="outline" onClick={() => setSelectedProduct(null)}><ArrowLeft aria-hidden="true" />Volver a las fotos</Button>
        <div className="flex items-start gap-3">
          <div className="w-28 shrink-0"><ProductPhoto product={selectedProduct} /></div>
          <div><h4 className="font-semibold">{selectedProduct.title}</h4><p className="text-sm text-muted-foreground">Selecciona la talla o variante que se lleva.</p></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {selectedProduct.variants.map(variant => <Button key={variant.id} type="button" variant="outline" disabled={variant.inventoryQuantity <= 0} className="h-auto min-h-12 justify-between gap-3 whitespace-normal text-left" onClick={() => { onAdd(selectedProduct, variant); setSelectedProduct(null); }}>
            <span>{variant.title === 'Default Title' ? 'Talla única' : variant.title}<span className="block text-xs text-muted-foreground">{variant.inventoryQuantity <= 0 ? 'Agotado' : `${variant.inventoryQuantity} disponibles`}</span></span>
            <span className="shrink-0">{formatCurrency(variant.price)} · Añadir</span>
          </Button>)}
        </div>
      </div> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visibleProducts.map(product => <button key={product.id} type="button" aria-label={`Seleccionar ${product.title}`} disabled={!product.variants.some(variant => variant.inventoryQuantity > 0)} className="min-w-0 overflow-hidden rounded border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={() => selectProduct(product)}>
            <ProductPhoto product={product} />
            <span className="block space-y-1 p-2">
              <span className="block text-sm font-medium">{product.title}</span>
              <span className="block text-sm text-muted-foreground">{formatCurrency(product.variants[0]?.price || '0')}</span>
              <span className="block text-xs text-muted-foreground">{product.variants.length > 1 ? 'Elegir talla / variante' : 'Añadir'}</span>
            </span>
          </button>)}
        </div>
        {loading && <p role="status" className="py-4 text-center text-sm text-muted-foreground">Cargando productos…</p>}
        {!loading && !error && !visibleProducts.length && <p className="py-4 text-center text-sm text-muted-foreground">No se encontraron productos.</p>}
      </>}
    </div>
  </div>;
}
