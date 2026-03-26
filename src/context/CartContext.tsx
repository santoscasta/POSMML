import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { CartState, CartAction, CartItem } from '../types/cart';
import { config } from '../config';

const initialState: CartState = {
  items: [],
  customer: null,
  discount: null,
  note: '',
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(
        (item) => item.variantId === action.payload.variantId,
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.variantId === action.payload.variantId
              ? { ...item, quantity: item.quantity + action.payload.quantity }
              : item,
          ),
        };
      }
      return { ...state, items: [...state.items, action.payload] };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((item) => item.variantId !== action.payload.variantId),
      };
    case 'UPDATE_QUANTITY':
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(
            (item) => item.variantId !== action.payload.variantId,
          ),
        };
      }
      return {
        ...state,
        items: state.items.map((item) =>
          item.variantId === action.payload.variantId
            ? { ...item, quantity: action.payload.quantity }
            : item,
        ),
      };
    case 'SET_CUSTOMER':
      return { ...state, customer: action.payload };
    case 'SET_DISCOUNT':
      return { ...state, discount: action.payload };
    case 'SET_NOTE':
      return { ...state, note: action.payload };
    case 'CLEAR_CART':
      return initialState;
    default:
      return state;
  }
}

interface CartContextValue {
  cart: CartState;
  dispatch: React.Dispatch<CartAction>;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, initialState);

  const addItem = (item: CartItem) => dispatch({ type: 'ADD_ITEM', payload: item });
  const removeItem = (variantId: string) =>
    dispatch({ type: 'REMOVE_ITEM', payload: { variantId } });
  const updateQuantity = (variantId: string, quantity: number) =>
    dispatch({ type: 'UPDATE_QUANTITY', payload: { variantId, quantity } });
  const clearCart = () => dispatch({ type: 'CLEAR_CART' });

  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  let discountAmount = 0;
  if (cart.discount) {
    if (cart.discount.type === 'percentage') {
      discountAmount = subtotal * (cart.discount.value / 100);
    } else {
      discountAmount = Math.min(cart.discount.value, subtotal);
    }
  }

  const total = Math.max(0, subtotal - discountAmount);
  // IVA-inclusive decomposition: prices already include tax
  const taxAmount = total - total / (1 + config.TAX_RATE / 100);
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        dispatch,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
