import type { CartItem as CartItemType } from '../../types/cart';
import { formatCurrency } from '../../utils/currency';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, Package } from 'lucide-react';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
}

export function CartItemRow({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border py-2">
      {item.imageUrl ? (
        <img
          className="size-10 shrink-0 rounded-sm object-cover"
          src={item.imageUrl}
          alt={item.title}
        />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted">
          <Package className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.title}</div>
        {item.variantTitle && item.variantTitle !== 'Default Title' && (
          <div className="truncate text-xs text-muted-foreground">
            {item.variantTitle}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onUpdateQuantity(item.variantId, item.quantity - 1)}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-6 text-center text-sm">{item.quantity}</span>
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onUpdateQuantity(item.variantId, item.quantity + 1)}
        >
          <Plus className="size-3" />
        </Button>
      </div>
      <div className="w-16 text-right text-sm font-medium">
        {formatCurrency(item.price * item.quantity)}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(item.variantId)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
