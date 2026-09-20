import { useState, useCallback, useMemo } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { PRODUCT_BY_BARCODE_QUERY } from '../graphql/products';
import { ProductSearch } from '../components/products/ProductSearch';
import { ProductGrid } from '../components/products/ProductGrid';
import { CategoryBrowser } from '../components/products/CategoryBrowser';
import { useCategories } from '../hooks/useCategories';
import { descendantCategoryIds, childCategories, type CatalogCategory } from '../utils/categoryTree';
import { VariantSelector } from '../components/products/VariantSelector';
import { CartPanel } from '../components/cart/CartPanel';
import type { Product, ProductVariant } from '../types/product';
import { es } from '../i18n/es';
import { cn } from '@/lib/utils';
import { ShoppingCart, LayoutGrid } from 'lucide-react';

import { readCatalogSettings } from '../utils/catalogSettings';

export function PosPage() {
  const [{ showOutOfStock, catalogView }] = useState(readCatalogSettings);
  const catalog = useCategories();
  const [categoryPath, setCategoryPath] = useState<CatalogCategory[]>([]);
  const [searching, setSearching] = useState(false);
  const currentCategory = categoryPath.at(-1);
  const hasChildren = !currentCategory || childCategories(catalog.categories, currentCategory.id).length > 0;
  const showProducts = catalogView !== 'explore' || (!!currentCategory && !hasChildren && !catalog.loading && !catalog.error);
  const { products, loading, searchQuery, setSearchQuery, error, retry } = useProducts(showOutOfStock);
  const visibleProducts = useMemo(() => {
    if (catalogView === 'products' || !currentCategory) return products;
    const ids = descendantCategoryIds(currentCategory);
    return products.filter(product => product.categoryIds?.some(id => ids.has(id)));
  }, [products, catalogView, currentCategory]);
  const navigateCategory = (path: CatalogCategory[]) => {
    setCategoryPath(path);
    setSearchQuery('');
    setSearching(false);
  };
  const categoryOptions = useMemo(() => {
    const options: { category: CatalogCategory; path: CatalogCategory[]; label: string }[] = [];
    function visit(categories: CatalogCategory[], parents: CatalogCategory[]) {
      for (const category of categories) {
        const path = [...parents, category];
        options.push({ category, path, label: path.map(item => item.title).join(' › ') });
        visit(category.children, path);
      }
    }
    visit(catalog.categories, []);
    return options;
  }, [catalog.categories]);
  const { addItem, itemCount } = useCart();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');

  const handleProductSelect = useCallback(
    (product: Product) => {
      if (product.variants.length === 1) {
        const variant = product.variants[0];
        addItem({
          variantId: variant.id,
          productId: product.id,
          title: product.title,
          variantTitle: variant.title,
          price: parseFloat(variant.price),
          quantity: 1,
          imageUrl: product.featuredImage?.url || null,
        });
      } else {
        setSelectedProduct(product);
        setVariantModalOpen(true);
      }
    },
    [addItem],
  );

  const handleVariantSelect = useCallback(
    (product: Product, variant: ProductVariant) => {
      addItem({
        variantId: variant.id,
        productId: product.id,
        title: product.title,
        variantTitle: variant.title,
        price: parseFloat(variant.price),
        quantity: 1,
        imageUrl: variant.image?.url || product.featuredImage?.url || null,
      });
    },
    [addItem],
  );

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      try {
        for (const product of products) {
          const variant = product.variants.find(
            (v) => v.barcode === barcode || v.sku === barcode,
          );
          if (variant) {
            addItem({
              variantId: variant.id,
              productId: product.id,
              title: product.title,
              variantTitle: variant.title,
              price: parseFloat(variant.price),
              quantity: 1,
              imageUrl: variant.image?.url || product.featuredImage?.url || null,
            });
            return;
          }
        }
        const data = await shopifyGraphQL<{ products: { edges: { node: Product & { variants: { edges: { node: ProductVariant }[] } } }[] } }>(
          PRODUCT_BY_BARCODE_QUERY,
          { barcode },
        );
        if (data.products.edges.length > 0) {
          const node = data.products.edges[0].node;
          const product: Product = {
            ...node,
            variants: node.variants.edges.map((e: { node: ProductVariant }) => e.node),
          };
          handleProductSelect(product);
        }
      } catch {
        // Silently fail for barcode scan
      }
    },
    [products, addItem, handleProductSelect],
  );

  useBarcodeScanner(handleBarcodeScan);

  const productsContent = (
    <div className="space-y-3 p-3 sm:p-4">
      {showProducts && <ProductSearch value={searchQuery} onChange={value => { setSearchQuery(value); setSearching(!!value.trim()); }} />}
      {catalogView !== 'products' && catalog.error && <div role="alert" className="rounded border border-destructive p-3 text-sm">No se han cargado las categorías: {catalog.error} <button className="underline" onClick={catalog.retry}>Reintentar categorías</button></div>}
      {catalogView === 'categories' && <label className="block space-y-1.5 text-sm font-medium">
        <span>Filtrar por categoría</span>
        <select aria-label="Filtrar por categoría" className="w-full min-w-0 rounded-lg border bg-card px-3 py-2.5" value={currentCategory?.id ?? ''} disabled={catalog.loading || !!catalog.error} onChange={event => navigateCategory(categoryOptions.find(option => option.category.id === event.target.value)?.path ?? [])}>
          <option value="">{catalog.loading ? 'Cargando categorías…' : 'Todas las categorías'}</option>
          {categoryOptions.map(option => <option key={option.category.id} value={option.category.id}>{option.label}</option>)}
        </select>
      </label>}
      {catalogView === 'explore' && <>
        <p className="text-sm text-muted-foreground">{hasChildren ? 'Selecciona una categoría para continuar hasta los productos.' : `Productos de ${currentCategory?.title}`}</p>
        {catalog.loading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Cargando categorías…</p> : !catalog.error && <CategoryBrowser categories={catalog.categories} path={categoryPath} onNavigate={navigateCategory} showCards={hasChildren} />}
      </>}
      {searching && <p className="text-xs text-muted-foreground">Buscando en {currentCategory?.title ?? 'todo el catálogo'}</p>}
      {showProducts && error && <div role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">
        No se ha cargado todo el catálogo: {error} <button className="underline" onClick={retry}>Reintentar</button>
      </div>}
      {showProducts && <ProductGrid
        products={visibleProducts}
        loading={loading}
        onProductSelect={handleProductSelect}
      />}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <img
          src="/logo-myminileo.jpg"
          alt="My Mini Leo"
          className="h-8 w-auto"
        />
        <h1 className="text-lg font-semibold text-foreground">{es.pos.title}</h1>
      </div>

      {/* Mobile tab bar */}
      <div className="flex shrink-0 border-b lg:hidden">
        <button
          onClick={() => setMobileTab('products')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'products'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
        >
          <LayoutGrid className="size-4" />
          Productos
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
            mobileTab === 'cart'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
        >
          <ShoppingCart className="size-4" />
          Carrito
          {itemCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {itemCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile content */}
      <div className="flex min-h-0 flex-1 lg:hidden">
        {mobileTab === 'products' ? (
          <div className="h-full w-full overflow-y-auto overscroll-contain" aria-label="Catálogo de productos">
            {productsContent}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <CartPanel />
          </div>
        )}
      </div>

      {/* Desktop two-column layout */}
      <div className="hidden min-h-0 min-w-0 flex-1 overflow-hidden lg:grid lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain" aria-label="Catálogo de productos">
          {productsContent}
        </div>
        <aside aria-label="Cesta de la compra" className="h-full min-h-0 overflow-hidden border-l border-border">
          <CartPanel />
        </aside>
      </div>

      {variantModalOpen && selectedProduct && (
        <VariantSelector
          product={selectedProduct}
          onClose={() => setVariantModalOpen(false)}
          onSelect={handleVariantSelect}
        />
      )}
    </div>
  );
}
