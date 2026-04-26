/**
 * stripeService.ts
 * Thin wrapper around the Stripe API for payment intent creation.
 */

interface CreatePaymentIntentParams {
  amount: number;   // in cents (e.g. 13296 for $132.96)
  currency: string;
  items: Array<{ id: string | number; quantity: number; price: number }>;
}

interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Creates a Stripe PaymentIntent via the internal proxy endpoint.
 * Throws a descriptive error (with a `userMessage` field) if the amount
 * is invalid before making any network call.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<PaymentIntentResult> {
  const { amount, currency, items } = params;

  // Guard: never forward an invalid amount to Stripe — this is what caused the 422.
  if (
    typeof amount !== 'number' ||
    isNaN(amount) ||
    !isFinite(amount) ||
    amount <= 0
  ) {
    const err = new Error(
      `[stripeService] createPaymentIntent called with invalid amount: ${amount}`
    ) as Error & { userMessage: string };
    err.userMessage =
      'Unable to calculate order total. Please refresh and try again.';
    throw err;
  }

  if (!currency || typeof currency !== 'string') {
    const err = new Error('[stripeService] createPaymentIntent: missing currency') as Error & {
      userMessage: string;
    };
    err.userMessage = 'Payment configuration error. Please contact support.';
    throw err;
  }

  const response = await fetch('/api/stripe/payment-intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency, items }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const statusMsg = `HTTP ${response.status}`;
    const serverMsg = body?.error ?? body?.message ?? 'Unknown error';

    const err = new Error(
      `[stripeService] PaymentIntent creation failed (${statusMsg}): ${serverMsg}`
    ) as Error & { userMessage: string };
    err.userMessage =
      response.status === 422
        ? 'Payment details are invalid. Please review your cart and try again.'
        : 'Payment initialization failed. Please try again or contact support.';
    throw err;
  }

  const data = await response.json();

  if (!data.clientSecret) {
    const err = new Error(
      '[stripeService] Response missing clientSecret'
    ) as Error & { userMessage: string };
    err.userMessage = 'Payment initialization failed. Please try again.';
    throw err;
  }

  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.id,
  };
}
