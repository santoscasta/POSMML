import { useState } from 'react';
import type { Discount } from '../../types/cart';
import { es } from '../../i18n/es';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface DiscountInputProps {
  currentDiscount: Discount | null;
  onApply: (discount: Discount | null) => void;
}

export function DiscountInput({ currentDiscount, onApply }: DiscountInputProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'percentage' | 'fixed'>(
    currentDiscount?.type || 'percentage',
  );
  const [value, setValue] = useState(currentDiscount?.value.toString() || '');

  const handleApply = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    onApply({ type, value: num });
    setOpen(false);
  };

  if (currentDiscount) {
    return (
      <div className="py-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onApply(null)}
        >
          <X className="size-3.5" />
          {es.discount.remove}
        </Button>
      </div>
    );
  }

  return (
    <div className="py-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-accent"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {es.discount.title}
      </Button>
      {open && (
        <div className="mt-2 flex items-center gap-2">
          <Select
            value={type}
            onValueChange={(val) => setType(val as 'percentage' | 'fixed')}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">{es.discount.percentage}</SelectItem>
              <SelectItem value="fixed">{es.discount.fixed}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === 'percentage' ? '10' : '5.00'}
            className="h-7 w-20"
          />
          <Button size="sm" onClick={handleApply}>
            {es.discount.apply}
          </Button>
        </div>
      )}
    </div>
  );
}
