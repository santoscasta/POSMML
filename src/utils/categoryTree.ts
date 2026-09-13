export interface CategoryMetaobject {
  id: string;
  displayName: string;
  fields: { key: string; value: string | null }[];
}
export interface CatalogCategory {
  id: string;
  title: string;
  image: { url: string } | null;
  productsCount: { count: number } | null;
  children: CatalogCategory[];
}

export function buildCategoryTree(objects: CategoryMetaobject[]): CatalogCategory[] {
  const nodes = new Map<string, CatalogCategory>();
  const parents = new Map<string, string | null>();
  for (const object of objects) {
    const fields = Object.fromEntries(object.fields.map(field => [field.key, field.value]));
    nodes.set(object.id, { id: object.id, title: fields.nombre || object.displayName,
      image: fields.imagen && /^https?:\/\//.test(fields.imagen) ? { url: fields.imagen } : null,
      productsCount: null, children: [] });
    parents.set(object.id, fields.padre || null);
  }
  const roots: CatalogCategory[] = [];
  for (const [id, node] of nodes) {
    const seen = new Set([id]);
    let ancestor = parents.get(id);
    while (ancestor) {
      if (seen.has(ancestor)) throw new Error('Hay un ciclo en las categorías de Shopify. Revisa la categoría padre.');
      seen.add(ancestor);
      ancestor = parents.get(ancestor);
    }
    const parentId = parents.get(id);
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parentId && !parent) throw new Error(`Falta la categoría padre de ${node.title}. Revisa sus metacampos en Shopify.`);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  function sort(items: CatalogCategory[]) {
    items.sort((a, b) => a.title.localeCompare(b.title, 'es'));
    items.forEach(item => sort(item.children));
  }
  sort(roots);
  return roots;
}

export function childCategories(categories: CatalogCategory[], id?: string): CatalogCategory[] {
  if (!id) return categories;
  for (const category of categories) {
    if (category.id === id) return category.children;
    const children = childCategories(category.children, id);
    if (children.length) return children;
  }
  return [];
}

export function descendantCategoryIds(category: CatalogCategory): Set<string> {
  const ids = new Set([category.id]);
  for (const child of category.children) for (const id of descendantCategoryIds(child)) ids.add(id);
  return ids;
}
