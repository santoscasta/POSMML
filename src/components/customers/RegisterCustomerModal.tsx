import { useState, type FormEvent } from 'react';
import { apiPost } from '../../utils/apiClient';
import type { Customer } from '../../types/customer';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RegisterCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

export function RegisterCustomerModal({ open, onClose, onCreated }: RegisterCustomerModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailMarketingConsent, setEmailMarketingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setEmailMarketingConsent(false);
    setError(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const customer = await apiPost<Customer>('/customers', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        emailMarketingConsent,
      });
      setSaving(false);
      reset();
      onClose();
      onCreated(customer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar al cliente');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar cliente</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {error && <p role="alert" className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="customer-first-name" className="mb-1 block text-sm font-medium">Nombre *</label>
              <Input id="customer-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required maxLength={250} autoComplete="given-name" disabled={saving} />
            </div>
            <div>
              <label htmlFor="customer-last-name" className="mb-1 block text-sm font-medium">Apellidos</label>
              <Input id="customer-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={250} autoComplete="family-name" disabled={saving} />
            </div>
          </div>
          <div>
            <label htmlFor="customer-email" className="mb-1 block text-sm font-medium">Correo electrónico *</label>
            <Input id="customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" disabled={saving} />
          </div>
          <div>
            <label htmlFor="customer-phone" className="mb-1 block text-sm font-medium">Teléfono (opcional)</label>
            <Input id="customer-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+34607140250" autoComplete="tel" disabled={saving} />
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded border p-3 text-sm">
            <input type="checkbox" checked={emailMarketingConsent} onChange={(event) => setEmailMarketingConsent(event.target.checked)} disabled={saving} className="mt-0.5 size-4 shrink-0 accent-primary" />
            <span>El cliente acepta recibir novedades y promociones por correo.<span className="block text-xs text-muted-foreground">Márcalo solo si ha dado su consentimiento.</span></span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar y añadir al pedido'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
