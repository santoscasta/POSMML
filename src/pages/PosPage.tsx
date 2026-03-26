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

export function PosPage() {
  const { products, loading, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, categories, hasNextPage, loadMore } =
    useProducts();
  const { addItem } = useCart();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);

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

  // Barcode scanner support
  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      try {
        // Try to find product by barcode in currently loaded products first
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
        // If not found locally, search Shopify
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

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <img
          src="/logo-myminileo.jpg"
          alt="My Mini Leo"
          className="h-8 w-auto"
        />
        <h1 className="text-lg font-semibold text-foreground">{es.pos.title}</h1>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px]">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-4">
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
