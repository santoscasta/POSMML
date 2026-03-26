import type { Product } from '../../types/product';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const hasVariants = product.variants.length > 1;
  const firstVariant = product.variants[0];
  const outOfStock = product.totalInventory <= 0;

  return (
    <Card
      size="sm"
      className={cn(
        'cursor-pointer rounded-sm transition-shadow hover:shadow-md',
        outOfStock && 'pointer-events-none opacity-50',
      )}
      onClick={() => !outOfStock && onSelect(product)}
    >
      {product.featuredImage?.url ? (
        <img
          className="aspect-[4/3] w-full rounded-t-sm object-cover"
          src={product.featuredImage.url}
          alt={product.featuredImage.altText || product.title}
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-t-sm bg-muted">
          <Package className="size-10 text-muted-foreground" />
        </div>
      )}
      <CardContent className="space-y-1">
        <div className="truncate text-sm font-medium text-foreground">
          {product.title}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {formatCurrency(firstVariant?.price || '0')}
          {hasVariants && (
            <span className="text-xs text-accent">
              {' '}· {product.variants.length} variantes
            </span>
          )}
        </div>
        {outOfStock ? (
          <Badge variant="destructive" className="text-[10px]">
            {es.pos.outOfStock}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            {product.totalInventory} {es.pos.units}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
