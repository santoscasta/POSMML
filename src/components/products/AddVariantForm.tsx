import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Product } from '../../types/product';

export function AddVariantForm({ product, busy, save }: { product: Product; busy: boolean; save: (input: { options: { name: string; value: string }[]; price: string; sku: string; barcode: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(() => (product.variants[0]?.selectedOptions || [{ name: 'Variante', value: '' }]).map(option => ({ name: option.name, value: '' })));
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  if (!open) return <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(true)}><Plus className="size-4" />Añadir variante</Button>;
  return <form className="space-y-3 rounded-lg border bg-muted/30 p-3" onSubmit={event => { event.preventDefault(); void save({ options, price, sku, barcode }); }}>
    <h3 className="font-medium">Nueva variante</h3><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {options.map((option, index) => <label key={option.name} className="space-y-1 text-sm">{option.name === 'Title' ? 'Variante' : option.name}<Input required maxLength={255} value={option.value} onChange={event => setOptions(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /></label>)}
      <label className="space-y-1 text-sm">Precio (€)<Input required type="number" inputMode="decimal" min="0" max="999999999.99" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label>
      <label className="space-y-1 text-sm">SKU<Input maxLength={255} value={sku} onChange={event => setSku(event.target.value)} /></label><label className="space-y-1 text-sm">Código de barras<Input maxLength={255} value={barcode} onChange={event => setBarcode(event.target.value)} /></label>
    </fieldset><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={busy}>Crear variante</Button></div>
  </form>;
}
