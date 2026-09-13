import { ChevronRight, FolderOpen, ArrowLeft } from 'lucide-react';
import { childCategories, type CatalogCategory } from '../../utils/categoryTree';

interface Props {
  categories: CatalogCategory[];
  path: CatalogCategory[];
  onNavigate: (path: CatalogCategory[]) => void;
  showCards: boolean;
}
export function CategoryBrowser({ categories, path, onNavigate, showCards }: Props) {
  const children = childCategories(categories, path.at(-1)?.id);
  return <div className="space-y-3">
    <nav aria-label="Ruta de categorías" className="flex flex-wrap items-center gap-1 text-sm">
      {path.length > 0 && <button aria-label="Volver a la categoría anterior" className="rounded-lg p-2 hover:bg-muted" onClick={() => onNavigate(path.slice(0, -1))}><ArrowLeft className="size-4" /></button>}
      <button className="rounded-lg px-2 py-2 font-medium text-primary hover:bg-muted" onClick={() => onNavigate([])}>Categorías</button>
      {path.map((category, index) => <span key={category.id} className="flex min-w-0 items-center gap-1">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <button aria-current={index === path.length - 1 ? 'page' : undefined} className="rounded-lg px-2 py-2 text-left hover:bg-muted" onClick={() => onNavigate(path.slice(0, index + 1))}>{category.title}</button>
      </span>)}
    </nav>
    {showCards && <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 min-[1500px]:grid-cols-3">
      {children.map(category => {
        const descendants = childCategories(categories, category.id);
        return <button key={category.id} onClick={() => onNavigate([...path, category])} className="group flex h-32 min-w-0 overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-4">
            <span className="font-medium text-primary">{category.title}</span>
            <span className="text-xs text-muted-foreground">{[descendants.length > 0 ? `${descendants.length} ${descendants.length === 1 ? 'subcategoría' : 'subcategorías'}` : null, category.productsCount ? `${category.productsCount.count} productos${descendants.length > 0 ? ' directos' : ''}` : descendants.length ? null : 'Ver productos'].filter(Boolean).join(' · ')}</span>
          </span>
          {category.image ? <img src={category.image.url} alt="" loading="lazy" className="h-full w-24 shrink-0 object-cover sm:w-28" /> : <span className="flex w-20 shrink-0 items-center justify-center bg-muted/40"><FolderOpen aria-hidden="true" className="size-8 text-primary/40" /></span>}
        </button>;
      })}
      {children.length === 0 && <p className="text-sm text-muted-foreground">No hay categorías disponibles. Puedes consultar todos los productos.</p>}
    </div>}
  </div>;
}
