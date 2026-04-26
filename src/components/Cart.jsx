import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import CartItem from './CartItem';
import { selectCartItems, selectCartTotal, clearCart } from '../store/cartSlice';
import { isValidCartItem, formatCurrency } from '../utils/cartHelpers';
import { createPaymentIntent } from '../services/stripeService';
import { validateCheckout } from '../services/checkoutService';

export default function Cart() {
  const dispatch = useDispatch();
  const cartItems = useSelector(selectCartItems);
  const cartTotal = useSelector(selectCartTotal);

  const [isLoading, setIsLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);

  const handleCheckout = async () => {
    setCheckoutError(null);

    // --- Pre-submission validation: block malformed items before they reach the API ---
    const invalidItems = cartItems.filter((item) => !isValidCartItem(item));
    if (invalidItems.length > 0) {
      setCheckoutError(
        'One or more items in your cart are unavailable or have missing pricing. ' +
          'Please remove them before continuing.'
      );
      return;
    }

    if (cartItems.length === 0) {
      setCheckoutError('Your cart is empty.');
      return;
    }

    if (typeof cartTotal !== 'number' || isNaN(cartTotal) || cartTotal <= 0) {
      setCheckoutError('Unable to calculate cart total. Please refresh and try again.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Validate cart server-side
      await validateCheckout(cartItems);

      // 2. Create Stripe PaymentIntent
      const { clientSecret } = await createPaymentIntent({
        amount: Math.round(cartTotal * 100), // convert dollars → cents
        currency: 'usd',
        items: cartItems.map(({ id, quantity, price }) => ({ id, quantity, price })),
      });

      // 3. Redirect to payment confirmation page
      window.location.href = `/checkout/payment?secret=${encodeURIComponent(clientSecret)}`;
    } catch (err) {
      console.error('[Cart] Checkout failed:', err);
      setCheckoutError(
        err?.userMessage ||
          'Payment could not be initialized. Please try again or contact support.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const hasInvalidItems = cartItems.some((item) => !isValidCartItem(item));

  return (
    <section className="cart" aria-label="Shopping cart">
      <h1 className="cart__title">Your Cart</h1>

      {cartItems.length === 0 ? (
        <p className="cart__empty">Your cart is empty.</p>
      ) : (
        <>
          <ul className="cart__items" aria-label="Cart items">
            {cartItems.map((item, index) => (
              <li key={item?.id ?? `malformed-${index}`}>
                <CartItem item={item} />
              </li>
            ))}
          </ul>

          <div className="cart__summary">
            <span className="cart__total-label">Total:</span>
            <span className="cart__total-value">
              {typeof cartTotal === 'number' && !isNaN(cartTotal)
                ? formatCurrency(cartTotal)
                : 'N/A'}
            </span>
          </div>

          {checkoutError && (
            <div className="cart__error" role="alert" aria-live="assertive">
              {checkoutError}
            </div>
          )}

          <button
            className="cart__checkout-btn"
            onClick={handleCheckout}
            disabled={isLoading || hasInvalidItems}
            aria-busy={isLoading}
          >
            {isLoading ? 'Processing…' : 'Pay with Card'}
          </button>

          {hasInvalidItems && (
            <p className="cart__warning" role="status">
              Remove unavailable items above to continue checkout.
            </p>
          )}
        </>
      )}
    </section>
  );
}
