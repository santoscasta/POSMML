import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Product } from '../../types/product';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const [imageOpen, setImageOpen] = useState(false);
  const hasVariants = product.variants.length > 1;
  const firstVariant = product.variants[0];
  const outOfStock = product.totalInventory <= 0;

  return (
    <>
    <Card
      size="sm"
      className={cn(
        'cursor-pointer rounded-sm transition-shadow hover:shadow-md',
        outOfStock && 'opacity-50',
      )}
      onClick={() => !outOfStock && onSelect(product)}
    >
      {product.featuredImage?.url ? (
        <button
          type="button"
          className="group relative block w-full cursor-zoom-in rounded-t-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`Ampliar imagen de ${product.title}`}
          onClick={event => { event.stopPropagation(); setImageOpen(true); }}
        >
          <img
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full rounded-t-sm object-cover"
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
          />
          <span className="absolute bottom-2 right-2 rounded-full bg-white/90 p-1.5 text-black shadow-sm"><ZoomIn className="size-4" /></span>
        </button>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-t-sm bg-muted">
          <Package className="size-10 text-muted-foreground" />
        </div>
      )}
      <CardContent className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {product.title}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
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
    {product.featuredImage?.url && <Dialog open={imageOpen} onOpenChange={setImageOpen}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={false}>
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{product.title}</DialogTitle>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cerrar</DialogClose>
        </div>
        <img
          className="max-h-[70dvh] w-full object-contain"
          src={product.featuredImage.url}
          alt={product.featuredImage.altText || product.title}
        />
      </DialogContent>
    </Dialog>}
    </>
  );
}
