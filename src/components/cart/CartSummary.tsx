import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { Separator } from '@/components/ui/separator';

interface CartSummaryProps {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

export function CartSummary({ subtotal, discountAmount, taxAmount, total }: CartSummaryProps) {
  return (
    <div className="space-y-1.5 py-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{es.pos.subtotal}</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      {discountAmount > 0 && (
        <div className="flex justify-between text-sm text-success">
          <span>{es.pos.discount}</span>
          <span>-{formatCurrency(discountAmount)}</span>
        </div>
      )}
      {taxAmount > 0 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{es.pos.tax} (IVA incl.)</span>
          <span>{formatCurrency(taxAmount)}</span>
        </div>
      )}
      <Separator />
      <div className="flex justify-between text-base font-semibold">
        <span>{es.pos.total}</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
