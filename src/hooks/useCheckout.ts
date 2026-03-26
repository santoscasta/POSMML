import { useState, useCallback } from 'react';
import { useCreateOrder } from './useCreateOrder';
import { apiPost } from '../utils/apiClient';
import type { CartState } from '../types/cart';
import type { PaymentMethod, PaymentInput, MixedPaymentSplit } from '../types/payment';

export function useCheckout() {
  const { createOrder } = useCreateOrder();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = useCallback(
    async (
      cart: CartState,
      total: number,
      method: PaymentMethod,
      cashReceived?: number,
      mixedSplits?: MixedPaymentSplit[],
      voucherCode?: string,
    ): Promise<string | null> => {
      try {
        setLoading(true);
        setError(null);

        const result = await createOrder(cart);
        if (!result) {
          throw new Error('Error al crear pedido');
        }

        const paymentInput: PaymentInput & { voucherCode?: string } = {
          shopifyOrderId: result.id,
          shopifyOrderName: result.name,
          method,
          amount: total,
          type: 'sale',
        };

        if (method === 'CASH' && cashReceived != null) {
          paymentInput.cashReceived = cashReceived;
          paymentInput.changeGiven = cashReceived - total;
        }

        if (method === 'MIXED' && mixedSplits) {
          paymentInput.mixedPayments = mixedSplits;
        }

        if (voucherCode) {
          paymentInput.voucherCode = voucherCode;
        }

        await apiPost('/payments', paymentInput);

        return result.name;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al procesar el pago';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [createOrder],
  );

  return { checkout, loading, error };
}
