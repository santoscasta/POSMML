export interface CartItem {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
}

export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
}

export interface CartState {
  items: CartItem[];
  customer: import('./customer').Customer | null;
  discount: Discount | null;
  note: string;
}

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: { variantId: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { variantId: string; quantity: number } }
  | { type: 'SET_CUSTOMER'; payload: import('./customer').Customer | null }
  | { type: 'SET_DISCOUNT'; payload: Discount | null }
  | { type: 'SET_NOTE'; payload: string }
  | { type: 'CLEAR_CART' };
