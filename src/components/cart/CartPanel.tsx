import { useCart } from '../../context/CartContext';
import { useSession } from '../../context/SessionContext';
import { CartItemRow } from './CartItem';
import { CartSummary } from './CartSummary';
import { DiscountInput } from './DiscountInput';
import { CustomerSearch } from '../customers/CustomerSearch';
import { CustomerBadge } from '../customers/CustomerBadge';
import { CheckoutModal } from '../checkout/CheckoutModal';
import { useCheckout } from '../../hooks/useCheckout';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { useState } from 'react';
import type { PaymentMethod, MixedPaymentSplit } from '../../types/payment';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ShoppingCart, AlertCircle } from 'lucide-react';

export function CartPanel() {
  const {
    cart,
    removeItem,
    updateQuantity,
    clearCart,
    dispatch,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    itemCount,
  } = useCart();
  const { isOpen: sessionOpen } = useSession();
  const { checkout, error: checkoutError } = useCheckout();
  const [showCheckout, setShowCheckout] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCheckout = async (
    method: PaymentMethod,
    cashReceived?: number,
    mixedSplits?: MixedPaymentSplit[],
    voucherCode?: string,
  ) => {
    setSuccessMessage(null);
    const orderName = await checkout(cart, total, method, cashReceived, mixedSplits, voucherCode);
    if (orderName) {
      clearCart();
      // Don't close modal — let user print/email ticket first
      // Modal closes when user clicks "Cerrar y siguiente venta"
    }
    return orderName;
  };

  return (
    <Card className="flex h-full flex-col rounded-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            {es.pos.cart}
          </span>
          <Badge variant="secondary">{itemCount}</Badge>
        </CardTitle>
      </CardHeader>

      <ScrollArea className="flex-1">
        <CardContent className="space-y-3">
          {successMessage && (
            <div className="rounded-sm bg-success/10 px-3 py-2 text-sm font-medium text-success">
              {successMessage}
            </div>
          )}
          {checkoutError && (
            <div className="flex items-center gap-2 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {checkoutError}
            </div>
          )}

          {!sessionOpen && (
            <div className="flex items-center gap-2 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              Abre una sesión de caja antes de cobrar
            </div>
          )}

          {cart.customer ? (
            <CustomerBadge
              customer={cart.customer}
              onRemove={() => dispatch({ type: 'SET_CUSTOMER', payload: null })}
            />
          ) : (
            <CustomerSearch
              onSelect={(customer) => dispatch({ type: 'SET_CUSTOMER', payload: customer })}
            />
          )}

          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <ShoppingCart className="size-10" />
              <div className="text-sm">{es.pos.emptyCart}</div>
            </div>
          ) : (
            <>
              <div>
                {cart.items.map((item) => (
                  <CartItemRow
                    key={item.variantId}
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeItem}
                  />
                ))}
              </div>

              <DiscountInput
                currentDiscount={cart.discount}
                onApply={(discount) => dispatch({ type: 'SET_DISCOUNT', payload: discount })}
              />

              <CartSummary
                subtotal={subtotal}
                discountAmount={discountAmount}
                taxAmount={taxAmount}
                total={total}
              />

              <Separator />

              <div className="space-y-2 pb-2">
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                  onClick={() => setShowCheckout(true)}
                  disabled={!sessionOpen || cart.items.length === 0}
                >
                  {`${es.pos.createOrder} — ${formatCurrency(total)}`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={clearCart}
                >
                  {es.pos.clearCart}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </ScrollArea>

      {showCheckout && (
        <CheckoutModal
          open={showCheckout}
          total={total}
          subtotal={subtotal}
          taxAmount={taxAmount}
          discountAmount={discountAmount}
          itemCount={itemCount}
          items={cart.items.map(i => ({ title: i.title, variantTitle: i.variantTitle, quantity: i.quantity, price: i.price }))}
          customerEmail={cart.customer?.email}
          onConfirm={handleCheckout}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </Card>
  );
}
