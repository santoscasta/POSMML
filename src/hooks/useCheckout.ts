import { useState, useCallback, useRef, useEffect } from 'react';
import { apiPost, ApiError } from '../utils/apiClient';
import type { CartState } from '../types/cart';
import type { PaymentMethod, MixedPaymentSplit } from '../types/payment';

const STORAGE_KEY = 'pos.pending-checkout.v1';
interface PendingCheckout {
  operationId: string;
  cart: CartState;
  payment: { method: PaymentMethod; amount: number; cashReceived?: number; mixedPayments?: MixedPaymentSplit[]; voucherCode?: string };
}
function readPending(): PendingCheckout | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value ? JSON.parse(value) : null;
}
function updatePending(value: PendingCheckout | null) {
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('pos:checkout'));
}

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(readPending);
  const active = useRef(false);
  useEffect(() => {
    const sync = () => setPending(readPending());
    window.addEventListener('pos:checkout', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('pos:checkout', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const submit = useCallback(async (attempt: PendingCheckout): Promise<string | null> => {
    if (active.current) return null;
    active.current = true;
    setLoading(true);
    setError(null);
    try {
      // This write must succeed before making any external change.
      updatePending(attempt);
      const result = await apiPost<{ name: string }>('/checkout', attempt);
      updatePending(null);
      return result.name;
    } catch (error) {
      if (error instanceof ApiError && error.safeToRestart) updatePending(null);
      setError(error instanceof Error ? error.message : 'Error al procesar el pago');
      return null;
    } finally { active.current = false; setLoading(false); }
  }, []);

  const checkout = useCallback(async (
    cart: CartState, total: number, method: PaymentMethod, cashReceived?: number,
    mixedSplits?: MixedPaymentSplit[], voucherCode?: string,
  ): Promise<string | null> => {
    if (readPending()) {
      setError('Hay un cobro pendiente. Usa «Reanudar cobro pendiente» antes de empezar otro.');
      return null;
    }
    return submit({ operationId: crypto.randomUUID(), cart,
      payment: { method, amount: Math.round(total * 100) / 100, cashReceived,
        mixedPayments: mixedSplits, voucherCode } });
  }, [submit]);

  const resume = useCallback(async () => {
    const attempt = readPending();
    return attempt ? submit(attempt) : null;
  }, [submit]);

  return { checkout, resume, pending, loading, error };
}
