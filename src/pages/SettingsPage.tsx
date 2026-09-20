import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { MailPage } from './MailPage';
import { Button } from '@/components/ui/button';
import { readCatalogSettings, saveCatalogSettings, type CatalogView } from '../utils/catalogSettings';
import { cn } from '@/lib/utils';

function CatalogSettings() {
  const [draft, setDraft] = useState(readCatalogSettings);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  return <section className="space-y-4 rounded-lg border bg-white p-4 sm:p-6">
    <div><h2 className="text-lg font-semibold">Catálogo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Personaliza cómo se muestran los productos en este dispositivo.</p></div>
    <form className="space-y-5" onSubmit={event => {
      event.preventDefault(); setError(''); setNotice('');
      try { saveCatalogSettings(draft); setNotice('Ajustes guardados. Se aplicarán al volver al POS.'); }
      catch { setError('No se han podido guardar los ajustes en este dispositivo.'); }
    }}>
      <div className="space-y-2"><label htmlFor="catalog-view" className="block text-sm font-medium">Vista del catálogo</label>
        <select id="catalog-view" className="w-full rounded-lg border bg-white px-3 py-2.5" value={draft.catalogView} onChange={event => { setDraft({ ...draft, catalogView: event.target.value as CatalogView }); setNotice(''); }}>
          <option value="categories">Por categorías</option>
          <option value="products">Todos los productos</option>
          <option value="explore">Explorar categorías</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={draft.showOutOfStock} onChange={event => { setDraft({ ...draft, showOutOfStock: event.target.checked }); setNotice(''); }} />Mostrar productos agotados</label>
      <Button type="submit">Guardar ajustes</Button>
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </section>;
}

export function SettingsPage() {
  return <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-xl font-semibold">Ajustes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configura el catálogo, los correos y los avisos del TPV.</p></div>
    <nav aria-label="Secciones de ajustes" className="flex flex-wrap gap-2">
      {[['/ajustes', 'Catálogo'], ['/ajustes/correos', 'Correos y avisos']].map(([to, label]) => <NavLink key={to} to={to} end style={({ isActive }) => ({ color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)' })} className={({ isActive }) => cn('rounded-lg border px-4 py-2 text-sm font-medium', isActive ? 'border-primary bg-primary text-primary-foreground' : 'bg-white hover:bg-muted')}>{label}</NavLink>)}
    </nav>
    <Routes>
      <Route index element={<CatalogSettings />} />
      <Route path="correos" element={<MailPage />} />
      <Route path="*" element={<Navigate to="/ajustes" replace />} />
    </Routes>
  </div>;
}
