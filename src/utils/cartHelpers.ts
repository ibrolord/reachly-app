/**
 * cartHelpers.ts
 * Utility functions for cart data validation and formatting.
 */

export interface CartItem {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  sku?: string;
  productId?: string | number;
}

/**
 * Type-guard: returns true only if the item has a valid numeric price
 * and a positive integer quantity.
 */
export function isValidCartItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  if (typeof i.price !== 'number' || isNaN(i.price) || i.price < 0) return false;
  if (typeof i.quantity !== 'number' || isNaN(i.quantity) || i.quantity < 1) return false;
  return true;
}

/**
 * Filters out any cart items that fail the isValidCartItem check.
 * Logs a warning for each removed item to aid debugging.
 */
export function sanitizeCartItems(items: unknown[]): CartItem[] {
  if (!Array.isArray(items)) {
    console.warn('[cartHelpers] sanitizeCartItems received a non-array:', items);
    return [];
  }

  return items.filter((item) => {
    const valid = isValidCartItem(item);
    if (!valid) {
      console.warn(
        '[cartHelpers] Removing malformed cart item (missing/invalid price or quantity):',
        item
      );
    }
    return valid;
  });
}

/**
 * Calculates the cart total from an array of valid CartItems.
 * Returns 0 if the array is empty or contains no valid items.
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Formats a numeric dollar amount as a locale currency string.
 */
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
