import type { Customer } from '../../types/customer';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface CustomerBadgeProps {
  customer: Customer;
  onRemove: () => void;
}

export function CustomerBadge({ customer, onRemove }: CustomerBadgeProps) {
  const initials = `${customer.firstName?.[0] || ''}${customer.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="flex items-center justify-between rounded-sm border border-border bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
          {initials}
        </div>
        <div>
          <div className="text-sm font-medium">
            {customer.firstName} {customer.lastName}
          </div>
          {customer.email && (
            <div className="text-xs text-muted-foreground">{customer.email}</div>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
