import { es } from '../../i18n/es';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProductSearch({ value, onChange }: ProductSearchProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={es.pos.searchPlaceholder}
        autoComplete="off"
        className="pl-9 pr-8"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
          onClick={() => onChange('')}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
