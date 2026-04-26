import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

// Schema for a single cart item — price and quantity must be valid positive numbers.
const CartItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  price: z
    .number({ invalid_type_error: 'price must be a number' })
    .positive({ message: 'price must be greater than 0' }),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int()
    .positive({ message: 'quantity must be a positive integer' }),
  name: z.string().optional(),
  sku: z.string().optional(),
});

const CheckoutValidateBodySchema = z.object({
  items: z
    .array(CartItemSchema)
    .min(1, { message: 'Cart must contain at least one item' }),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Input validation (returns 400, not 500, for bad payloads) ---
  const parseResult = CheckoutValidateBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    const errors = parseResult.error.flatten();
    console.warn('[checkout/validate] Invalid request body:', errors);
    return res.status(400).json({
      error: 'Invalid cart data',
      details: errors,
    });
  }

  const { items } = parseResult.data;

  try {
    // Verify each item is still available and the price hasn't changed.
    const validationResults = await Promise.all(
      items.map(async (item) => {
        // TODO: replace with real product DB/cache lookup
        const product = await fetchProductById(item.id);
        if (!product) {
          return { id: item.id, valid: false, reason: 'Product not found' };
        }
        if (product.price !== item.price) {
          return {
            id: item.id,
            valid: false,
            reason: `Price mismatch: expected ${product.price}, got ${item.price}`,
          };
        }
        if (product.stock < item.quantity) {
          return {
            id: item.id,
            valid: false,
            reason: `Insufficient stock (${product.stock} available)`,
          };
        }
        return { id: item.id, valid: true };
      })
    );

    const failed = validationResults.filter((r) => !r.valid);
    if (failed.length > 0) {
      return res.status(400).json({
        error: 'Some cart items failed validation',
        invalidItems: failed,
      });
    }

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    return res.status(200).json({ valid: true, total });
  } catch (err) {
    console.error('[checkout/validate] Unexpected error during validation:', err);
    return res.status(500).json({
      error: 'Internal server error. Please try again.',
    });
  }
}

// ---------------------------------------------------------------------------
// Stub — replace with your actual data-access layer
// ---------------------------------------------------------------------------
async function fetchProductById(
  id: string | number
): Promise<{ price: number; stock: number } | null> {
  // e.g. return await db.products.findUnique({ where: { id } });
  void id;
  return null;
}
