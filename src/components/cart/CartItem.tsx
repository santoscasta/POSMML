import type { CartItem as CartItemType } from '../../types/cart';
import { formatCurrency } from '../../utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Trash2, Package } from 'lucide-react';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  onUpdatePrice: (variantId: string, price: number) => void;
  onRemove: (variantId: string) => void;
}

export function CartItemRow({ item, onUpdateQuantity, onUpdatePrice, onRemove }: CartItemProps) {
  return (
    <div className="space-y-2 border-b border-border py-2">
      <div className="flex items-center gap-2">
        {item.imageUrl ? (
          <img className="size-10 shrink-0 rounded-sm object-cover" src={item.imageUrl} alt={item.title} />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            <Package className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title}</div>
          {item.variantTitle && item.variantTitle !== 'Default Title' && (
            <div className="truncate text-xs text-muted-foreground">{item.variantTitle}</div>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive"
          onClick={() => onRemove(item.variantId)} aria-label={`Quitar ${item.title}`}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pl-12">
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon-xs"
            onClick={() => onUpdateQuantity(item.variantId, item.quantity - 1)} aria-label="Reducir cantidad">
            <Minus className="size-3" />
          </Button>
          <span className="w-6 text-center text-sm">{item.quantity}</span>
          <Button variant="outline" size="icon-xs"
            onClick={() => onUpdateQuantity(item.variantId, item.quantity + 1)} aria-label="Aumentar cantidad">
            <Plus className="size-3" />
          </Button>
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Precio
          <span className="relative w-20">
            <Input type="number" min="0" step="0.01" value={item.price}
              onChange={(event) => {
                const price = Number(event.target.value);
                if (Number.isFinite(price) && price >= 0) onUpdatePrice(item.variantId, price);
              }}
              className="h-8 pr-6 text-right text-sm text-foreground" />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs">€</span>
          </span>
        </label>
        <div className="w-16 shrink-0 text-right text-sm font-medium" title="Total de la línea">
          {formatCurrency(item.price * item.quantity)}
        </div>
      </div>
    </div>
  );
}
