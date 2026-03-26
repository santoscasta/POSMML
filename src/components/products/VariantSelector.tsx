import type { Product, ProductVariant } from '../../types/product';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface VariantSelectorProps {
  product: Product;
  onClose: () => void;
  onSelect: (product: Product, variant: ProductVariant) => void;
}

export function VariantSelector({ product, onClose, onSelect }: VariantSelectorProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {product.title} — {es.pos.selectVariant}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {product.variants.map((variant) => {
            const outOfStock = variant.inventoryQuantity <= 0;
            return (
              <div
                key={variant.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-sm border p-3 transition-colors hover:bg-muted',
                  outOfStock && 'pointer-events-none opacity-50',
                )}
                onClick={() => {
                  if (!outOfStock) {
                    onSelect(product, variant);
                    onClose();
                  }
                }}
              >
                <span className="text-sm font-medium">{variant.title}</span>
                <div className="flex items-center gap-2">
                  {outOfStock ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {es.pos.outOfStock}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      {variant.inventoryQuantity} {es.pos.units}
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">
                    {formatCurrency(variant.price)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
