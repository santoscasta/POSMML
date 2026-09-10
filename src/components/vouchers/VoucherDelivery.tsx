import { useEffect, useRef, useState } from 'react';
import { apiPost } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { escapeHtml, printDocument, thermalStyles } from '../../utils/print';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Voucher } from '../../types/voucher';

export function VoucherDelivery({ voucher, autoSend = false }: { voucher: Voucher; autoSend?: boolean }) {
  const [email, setEmail] = useState(voucher.customerEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const attempted = useRef(false);
  const send = async (address: string) => {
    setSending(true); setError(''); setSent('');
    try {
      await apiPost('/vouchers/send-email', { id: voucher.id, email: address.trim() });
      setSent(address.trim());
    } catch (err) {
      setError(`El vale sigue emitido. No se ha confirmado el envío: ${err instanceof Error ? err.message : 'Error de conexión'}`);
    } finally { setSending(false); }
  };
  useEffect(() => {
    if (autoSend && voucher.customerEmail && !attempted.current) {
      attempted.current = true;
      void send(voucher.customerEmail);
    }
    // One automatic attempt per issuance; retries are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="w-full space-y-3">
    {voucher.fullCode && <Button className="w-full" variant="outline" onClick={() => {
      const ok = printDocument(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Vale My mini Leo</title><style>${thermalStyles}</style></head><body>
        <div class="center brand">My mini Leo</div><h1 class="center">Vale</h1>
        <p class="center code">${escapeHtml(voucher.fullCode!)}</p>
        <p class="center total">${formatCurrency(voucher.currentBalance)}</p>
        <p>Emitido: ${escapeHtml(new Date(voucher.issuedAt).toLocaleDateString('es-ES'))}</p>
        <div class="line"></div><p class="footer">Presenta este código para utilizar tu vale.<br>myminileo.com</p></body></html>`);
      if (!ok) setError('El navegador ha bloqueado la impresión. Permite las ventanas emergentes y pulsa Imprimir vale.');
    }}>Imprimir vale</Button>}
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void send(email); }}>
      <Input aria-label="Correo del vale" type="email" required value={email} disabled={sending} onChange={e => setEmail(e.target.value)} placeholder="Email del cliente" />
      <Button className="w-full" variant="outline" disabled={sending || !email.trim()} type="submit">{sending ? 'Enviando…' : 'Enviar vale por correo'}</Button>
    </form>
    {sent && <p role="status" className="text-sm">Shopify ha aceptado el envío a {sent}. Revisa también spam.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
