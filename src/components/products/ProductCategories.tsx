import { useCategories } from '../../hooks/useCategories';
import type { CatalogCategory } from '../../utils/categoryTree';

export function ProductCategories({ value, onChange, disabled = false }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const { categories, loading, error, retry } = useCategories();
  function options(items: CatalogCategory[], prefix = ''): { id: string; label: string }[] {
    return items.flatMap(item => [{ id: item.id, label: prefix + item.title }, ...options(item.children, `${prefix}${item.title} / `)]);
  }
  return <fieldset disabled={disabled || loading} className="space-y-2 rounded-lg border p-3">
    <legend className="px-1 text-sm font-medium">Categorías del POS</legend>
    {loading ? <p className="text-xs text-muted-foreground">Cargando categorías…</p> : error ? <p role="alert" className="text-xs text-destructive">{error} <button type="button" onClick={retry}>Reintentar</button></p> : !categories.length ? <p className="text-xs text-muted-foreground">No hay categorías configuradas.</p> : <div className="max-h-36 space-y-2 overflow-y-auto">{options(categories).map(item => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={value.includes(item.id)} onChange={event => onChange(event.target.checked ? [...value, item.id] : value.filter(id => id !== item.id))} />{item.label}</label>)}</div>}
  </fieldset>;
}
