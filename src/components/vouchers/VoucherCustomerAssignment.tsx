import { useRef, useState } from 'react';
import { apiPost } from '../../utils/apiClient';
import { CustomerSearch } from '../customers/CustomerSearch';
import { Button } from '@/components/ui/button';
import type { Customer } from '../../types/customer';

export function VoucherCustomerAssignment({ voucherId, onAssigned }: { voucherId: string; onAssigned: (customer: Customer) => void }) {
  const [selected, setSelected] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  return <fieldset disabled={saving} className="w-full space-y-2 rounded border p-3 text-sm">
    <legend className="px-1 font-medium">Asociar cliente al vale</legend>
    <CustomerSearch onSelect={setSelected} />
    {selected && <>
      <p>{selected.firstName} {selected.lastName} · {selected.email || selected.phone}</p>
      <Button className="w-full" onClick={async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setSaving(true);
        setError('');
        try {
          const result = await apiPost<{ customer: Customer }>('/vouchers/assign-customer', { id: voucherId, customerId: selected.id });
          onAssigned(result.customer);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se ha podido asociar el cliente');
        } finally {
          inFlight.current = false;
          setSaving(false);
        }
      }}>{saving ? 'Asociando…' : 'Asociar cliente'}</Button>
    </>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </fieldset>;
}
