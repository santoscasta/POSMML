import { es } from '../../i18n/es';
import { Button } from '@/components/ui/button';

interface CategoryChipsProps {
  categories: string[];
  selected: string | null;
  onSelect: (cat: string | null) => void;
}

export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      <Button
        variant={selected === null ? 'default' : 'outline'}
        size="sm"
        className="shrink-0"
        onClick={() => onSelect(null)}
      >
        {es.pos.allCategories}
      </Button>
      {categories.map((cat) => (
        <Button
          key={cat}
          variant={selected === cat ? 'default' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => onSelect(cat)}
        >
          {cat}
        </Button>
      ))}
    </div>
  );
}
