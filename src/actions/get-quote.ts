'use server';

import { headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { cartItemSchema } from '@/schemas/booking';
import { BookingError, applyCoupon, priceCart } from '@/services/pricing';
import { z } from 'zod';

const quoteSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(10),
  currency: z.string().length(3),
  couponCode: z.string().trim().max(32).optional(),
});

export type QuoteResult =
  | { ok: true; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; currency: string }
  | { ok: false; code: string; message: string };

/**
 * Live price for the booking panel. Reserves nothing and charges nothing —
 * it exists so the number on screen is always the number at checkout.
 */
export async function getQuoteAction(input: unknown): Promise<QuoteResult> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: 'Check your selection and try again.' };

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const limit = await checkRateLimit('api', rateLimitIdentity(auth.user?.id ?? null, ip));
  if (!limit.success) return { ok: false, code: 'RATE_LIMITED', message: 'Slow down for a moment.' };

  try {
    let cart = await priceCart(supabase, parsed.data.items, parsed.data.currency);
    if (parsed.data.couponCode) {
      ({ cart } = await applyCoupon(supabase, cart, parsed.data.couponCode, auth.user?.id ?? null));
    }
    return {
      ok: true,
      subtotal: cart.subtotal,
      discountTotal: cart.discountTotal,
      taxTotal: cart.taxTotal,
      grandTotal: cart.grandTotal,
      currency: cart.currency,
    };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, code: error.code, message: error.message };
    console.error('[quote] failed', error);
    return { ok: false, code: 'UNEXPECTED', message: 'We couldn’t price that just now.' };
  }
}
