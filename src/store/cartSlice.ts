import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, sanitizeCartItems, calculateCartTotal, isValidCartItem } from '../utils/cartHelpers';

interface CartState {
  items: CartItem[];
  total: number;
}

const LOCAL_STORAGE_KEY = 'acme_cart';

function loadCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Sanitize at hydration time — strip any items missing required fields.
    return sanitizeCartItems(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.error('[cartSlice] Failed to parse cart from localStorage:', err);
    return [];
  }
}

function persistCartToStorage(items: CartItem[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[cartSlice] Failed to persist cart to localStorage:', err);
  }
}

const hydratedItems = loadCartFromStorage();

const initialState: CartState = {
  items: hydratedItems,
  total: calculateCartTotal(hydratedItems),
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /**
     * Replace the entire cart (e.g. from API response).
     * Sanitizes the incoming items before storing.
     */
    setCart(state, action: PayloadAction<unknown[]>) {
      const sanitized = sanitizeCartItems(action.payload);
      state.items = sanitized;
      state.total = calculateCartTotal(sanitized);
      persistCartToStorage(sanitized);
    },

    addItem(state, action: PayloadAction<CartItem>) {
      const incoming = action.payload;
      if (!isValidCartItem(incoming)) {
        console.error('[cartSlice] addItem: refusing to add malformed item:', incoming);
        return;
      }
      const existing = state.items.find((i) => i.id === incoming.id);
      if (existing) {
        existing.quantity += incoming.quantity;
      } else {
        state.items.push(incoming);
      }
      state.total = calculateCartTotal(state.items);
      persistCartToStorage(state.items);
    },

    removeItem(state, action: PayloadAction<string | number | null>) {
      if (action.payload === null || action.payload === undefined) {
        // Remove all malformed items (no id) as a cleanup fallback.
        state.items = state.items.filter(
          (i) => i.id !== null && i.id !== undefined && isValidCartItem(i)
        );
      } else {
        state.items = state.items.filter((i) => i.id !== action.payload);
      }
      state.total = calculateCartTotal(state.items);
      persistCartToStorage(state.items);
    },

    updateQuantity(
      state,
      action: PayloadAction<{ id: string | number; quantity: number }>
    ) {
      const { id, quantity } = action.payload;
      if (typeof quantity !== 'number' || isNaN(quantity) || quantity < 1) {
        console.warn('[cartSlice] updateQuantity: invalid quantity', quantity);
        return;
      }
      const item = state.items.find((i) => i.id === id);
      if (item) {
        item.quantity = quantity;
        state.total = calculateCartTotal(state.items);
        persistCartToStorage(state.items);
      }
    },

    clearCart(state) {
      state.items = [];
      state.total = 0;
      persistCartToStorage([]);
    },
  },
});

export const { setCart, addItem, removeItem, updateQuantity, clearCart } = cartSlice.actions;

// Selectors
export const selectCartItems = (state: { cart: CartState }) => state.cart.items;
export const selectCartTotal = (state: { cart: CartState }) => state.cart.total;
export const selectCartCount = (state: { cart: CartState }) =>
  state.cart.items.reduce((sum, i) => sum + i.quantity, 0);

export default cartSlice.reducer;
