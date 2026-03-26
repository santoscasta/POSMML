import { useState, useCallback } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { PRODUCT_BY_BARCODE_QUERY } from '../graphql/products';
import { ProductSearch } from '../components/products/ProductSearch';
import { ProductGrid } from '../components/products/ProductGrid';
import { CategoryChips } from '../components/products/CategoryChips';
import { VariantSelector } from '../components/products/VariantSelector';
import { CartPanel } from '../components/cart/CartPanel';
import type { Product, ProductVariant } from '../types/product';
import { es } from '../i18n/es';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ShoppingCart, LayoutGrid } from 'lucide-react';

export function PosPage() {
  const { products, loading, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, categories, hasNextPage, loadMore } =
    useProducts();
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
      <ProductSearch value={searchQuery} onChange={setSearchQuery} />
      {categories.length > 0 && (
        <CategoryChips
          categories={categories}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
        />
      )}
      <ProductGrid
        products={products}
        loading={loading}
        hasNextPage={hasNextPage}
        onProductSelect={handleProductSelect}
        onLoadMore={loadMore}
      />
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <img
          src="/logo-myminileo.jpg"
          alt="My Mini Leo"
          className="h-8 w-auto"
        />
        <h1 className="text-lg font-semibold text-foreground">{es.pos.title}</h1>
      </div>

      {/* Mobile tab bar */}
      <div className="flex border-b md:hidden">
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
      <div className="flex min-h-0 flex-1 md:hidden">
        {mobileTab === 'products' ? (
          <ScrollArea className="h-full w-full">
            {productsContent}
          </ScrollArea>
        ) : (
          <div className="flex-1 overflow-hidden">
            <CartPanel />
          </div>
        )}
      </div>

      {/* Desktop two-column layout */}
      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[1fr_380px]">
        <ScrollArea className="h-full">
          {productsContent}
        </ScrollArea>
        <div className="border-l border-border">
          <CartPanel />
        </div>
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
