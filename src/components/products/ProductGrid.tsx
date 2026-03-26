import { ProductCard } from './ProductCard';
import type { Product } from '../../types/product';
import { es } from '../../i18n/es';
import { Button } from '@/components/ui/button';
import { Package, Loader2 } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  hasNextPage: boolean;
  onProductSelect: (product: Product) => void;
  onLoadMore: () => void;
}

export function ProductGrid({
  products,
  loading,
  hasNextPage,
  onProductSelect,
  onLoadMore,
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={onProductSelect} />
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={onLoadMore} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {es.pos.loading}
              </>
            ) : (
              'Cargar más'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
