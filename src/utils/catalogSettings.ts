export type CatalogView = 'categories' | 'products' | 'explore';

export function readCatalogSettings() {
  const saved = localStorage.getItem('posmml.catalogView');
  const catalogView: CatalogView = saved === 'products' || saved === 'explore' ? saved : 'categories';
  return { catalogView, showOutOfStock: localStorage.getItem('posmml.showOutOfStock') !== 'false' };
}

export function saveCatalogSettings(settings: ReturnType<typeof readCatalogSettings>) {
  localStorage.setItem('posmml.catalogView', settings.catalogView);
  localStorage.setItem('posmml.showOutOfStock', String(settings.showOutOfStock));
}
