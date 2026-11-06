import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import type { SortDirection } from '../utils/sort';

interface SortableTableHeadProps {
  label: string;
  direction?: SortDirection;
  onSort: () => void;
}

export function SortableTableHead({ label, direction, onSort }: SortableTableHeadProps) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <TableHead aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
      <button
        type="button"
        onClick={onSort}
        aria-label={`Ordenar por ${label}`}
        title={`Ordenar por ${label}`}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-sm py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {label}<Icon aria-hidden="true" className={`size-3.5 shrink-0 ${direction ? '' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  );
}
