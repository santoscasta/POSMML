import { ProductCard } from './ProductCard';
import type { Product } from '../../types/product';
import { es } from '../../i18n/es';
import { Package, Loader2 } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  onProductSelect: (product: Product) => void;
}

export function ProductGrid({
  products,
  loading,
  onProductSelect,
}: ProductGridProps) {
  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Package className="size-10" />
        <div className="text-sm">{es.pos.noProducts}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={onProductSelect} />
        ))}
      </div>
      {loading && <div role="status" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando todos los productos…
      </div>}
    </div>
  );
}
