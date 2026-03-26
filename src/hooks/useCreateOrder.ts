import { useState, useCallback } from 'react';
import { shopifyGraphQL } from '../utils/graphqlClient';
import { CREATE_DRAFT_ORDER, COMPLETE_DRAFT_ORDER } from '../graphql/orders';
import type { CartState } from '../types/cart';

interface DraftOrderCreateResponse {
  draftOrderCreate: {
    draftOrder: { id: string; name: string } | null;
    userErrors: { field: string[]; message: string }[];
  };
}

interface DraftOrderCompleteResponse {
  draftOrderComplete: {
    draftOrder: {
      id: string;
      order: { id: string; name: string };
    } | null;
    userErrors: { field: string[]; message: string }[];
  };
}

export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useCallback(async (cart: CartState): Promise<{ name: string; id: string } | null> => {
    try {
      setLoading(true);
      setError(null);

      const lineItems = cart.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));

      const input: Record<string, unknown> = { lineItems, tags: ['POS MML'] };

      if (cart.customer) {
        input.customerId = cart.customer.id;
      }

      if (cart.note) {
        input.note = cart.note;
      }

      if (cart.discount) {
        if (cart.discount.type === 'percentage') {
          input.appliedDiscount = {
            valueType: 'PERCENTAGE',
            value: cart.discount.value,
          };
        } else {
          input.appliedDiscount = {
            valueType: 'FIXED_AMOUNT',
            value: cart.discount.value,
          };
        }
      }

      const draftData = await shopifyGraphQL<DraftOrderCreateResponse>(CREATE_DRAFT_ORDER, {
        input,
      });

      if (draftData.draftOrderCreate.userErrors.length > 0) {
        throw new Error(draftData.draftOrderCreate.userErrors.map((e) => e.message).join(', '));
      }

      const draftOrderId = draftData.draftOrderCreate.draftOrder!.id;

      const completeData = await shopifyGraphQL<DraftOrderCompleteResponse>(
        COMPLETE_DRAFT_ORDER,
        { id: draftOrderId },
      );

      if (completeData.draftOrderComplete.userErrors.length > 0) {
        throw new Error(
          completeData.draftOrderComplete.userErrors.map((e) => e.message).join(', '),
        );
      }

      const order = completeData.draftOrderComplete.draftOrder!.order;
      return { name: order.name, id: order.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear pedido';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createOrder, loading, error };
}
