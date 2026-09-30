import { useState } from 'react';
import { apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { paymentMethodLabel } from '../../utils/paymentDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CashSession } from '../../types/session';

type MissingOrder = NonNullable<CashSession['unregisteredOrders']>[number];

export function ReconcileOrderModal({ order, sessionId, onClose, onSaved }: {
  order: MissingOrder; sessionId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [parts, setParts] = useState([{ method: '', amount: '', voucherCode: '' }]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = order.amount;
  const update = (index: number, field: string, value: string) => setParts(parts.map((part, i) => i === index ? { ...part, [field]: value } : part));
  const save = async () => {
    setSaving(true); setError('');
    try {
      const splits = parts.map(part => ({ method: part.method, amount: Number(part.amount.replace(',', '.')),
        ...(part.method === 'VOUCHER' ? { voucherCode: part.voucherCode.trim() } : {}) }));
      const single = splits[0];
      const payment = splits.length === 1 ? { ...single, amount: total, cashReceived: single.method === 'CASH' ? total : undefined }
        : { method: 'MIXED', amount: total, mixedPayments: splits };
      await apiPost('/sessions/reconcile-order', { sessionId, orderId: order.id, payment });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la conciliación'); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Conciliar {order.name}</DialogTitle></DialogHeader>
      <p className="text-sm">Compra: <strong>{formatCurrency(total)}</strong>. Indica cómo se pagó según el ticket. Se registrará en la sesión abierta sin volver a cobrar ni descontar saldo de los vales.</p>
      {parts.map((part, index) => <div className="space-y-2 rounded border p-3" key={index}>
        <label className="block text-sm">Método de pago {index + 1}
          <select className="mt-1 w-full rounded border bg-background p-2" value={part.method} disabled={saving} onChange={event => update(index, 'method', event.target.value)}>
            <option value="">Seleccionar método</option>
            {['CASH', 'CARD', 'BIZUM', 'VOUCHER'].map(method => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
          </select>
        </label>
        {parts.length > 1 && <label className="block text-sm">Importe pagado
          <Input inputMode="decimal" value={part.amount} disabled={saving} onChange={event => update(index, 'amount', event.target.value)} />
        </label>}
        {part.method === 'VOUCHER' && <label className="block text-sm">Código del vale utilizado
          <Input value={part.voucherCode} disabled={saving} onChange={event => update(index, 'voucherCode', event.target.value)} />
        </label>}
        {parts.length > 1 && <Button size="sm" variant="outline" disabled={saving} onClick={() => setParts(parts.filter((_, i) => i !== index))}>Quitar parte</Button>}
      </div>)}
      <Button variant="outline" disabled={saving} onClick={() => setParts([...parts, { method: '', amount: '', voucherCode: '' }])}>Añadir otra forma de pago</Button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)} />He comprobado el ticket y este pago corresponde a esta sesión.</label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={saving || !confirmed || parts.some(part => !part.method || (part.method === 'VOUCHER' && !part.voucherCode.trim()) || (parts.length > 1 && !part.amount.trim()))} onClick={() => void save()}>{saving ? 'Guardando…' : 'Registrar pago ya cobrado'}</Button>
    </DialogContent>
  </Dialog>;
}
