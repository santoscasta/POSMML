export function RestockWarning({ titles }: { titles: string[] }) {
  if (!titles.length) return null;
  return <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
    <p className="font-semibold">No se puede reponer el stock de estos artículos</p>
    <p>{titles.join(', ')}.</p>
    <p>Falta una variante vinculada con control de inventario. Revisa el artículo en Shopify o desmarca «Reponer» y gestiona su stock por separado.</p>
  </div>;
}
