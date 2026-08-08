import 'server-only';
import type { Db } from '@/lib/supabase/server';
import { BookingError, applyCoupon, priceCart, type PricedCart } from './pricing';
import type { CreateBookingInput } from '@/schemas/booking';

const HOLD_MINUTES = 15;

export type BookingDraft = {
  bookingId: string;
  reference: string;
  amountDue: number;
  currency: string;
  holdExpiresAt: string;
  cart: PricedCart;
};

/**
 * Creates a booking in a held state and returns what checkout needs to take
 * payment. The sequence matters:
 *
 *   1. price on the server        — client totals are never trusted
 *   2. hold every seat            — row locks in Postgres, so no oversell
 *   3. write the booking          — with the idempotency key attached
 *   4. release on any failure     — held seats never leak
 *
 * Seats stay held for 15 minutes. `expire_stale_holds()` reclaims anything
 * the traveller abandons.
 */
export async function createBookingDraft(
  supabase: Db,
  admin: Db,
  input: CreateBookingInput,
  profileId: string | null,
): Promise<BookingDraft> {
  // Idempotency: a retried submit returns the original booking untouched.
  const { data: existing } = await admin
    .from('bookings')
    .select('id, reference, amount_due, currency, hold_expires_at, status')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'expired') {
      throw new BookingError('HOLD_EXPIRED', 'That checkout timed out. Please choose your date again.');
    }
    return {
      bookingId: existing.id,
      reference: existing.reference,
      amountDue: Number(existing.amount_due),
      currency: existing.currency,
      holdExpiresAt: existing.hold_expires_at!,
      cart: await priceCart(supabase, input.items, input.currency),
    };
  }

  let cart = await priceCart(supabase, input.items, input.currency);
  let couponId: string | null = null;

  if (input.couponCode) {
    const applied = await applyCoupon(supabase, cart, input.couponCode, profileId);
    cart = applied.cart;
    couponId = applied.couponId;
  }

  let walletApplied = 0;
  if (input.applyWallet && profileId) {
    const { data: wallet } = await admin
      .from('wallets').select('balance, currency').eq('profile_id', profileId).maybeSingle();
    if (wallet && wallet.currency === cart.currency) {
      walletApplied = Math.min(Number(wallet.balance), cart.grandTotal);
    }
  }

  const held: Array<{ departureId: string; seats: number }> = [];

  try {
    for (const line of cart.lines) {
      const { data: ok, error } = await admin.rpc('hold_seats', {
        p_departure_id: line.departureId,
        p_seats: line.seats,
      });
      if (error) throw error;
      if (!ok) throw new BookingError('SOLD_OUT', 'Those places were taken while you were deciding.');
      held.push({ departureId: line.departureId, seats: line.seats });
    }

    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const amountDue = Math.round((cart.grandTotal - walletApplied) * 100) / 100;

    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .insert({
        profile_id: profileId,
        company_id: cart.companyId,
        status: 'awaiting_payment',
        guest_email: input.guest.email,
        guest_name: input.guest.fullName,
        guest_phone: input.guest.phone,
        guest_locale: input.locale,
        currency: cart.currency,
        subtotal: cart.subtotal,
        discount_total: cart.discountTotal,
        fees_total: cart.feesTotal,
        tax_total: cart.taxTotal,
        grand_total: cart.grandTotal,
        wallet_applied: walletApplied,
        amount_due: amountDue,
        commission_total: cart.commissionTotal,
        supplier_net: cart.supplierNet,
        coupon_id: couponId,
        coupon_code: input.couponCode ?? null,
        hold_expires_at: holdExpiresAt,
        idempotency_key: input.idempotencyKey,
        utm: input.utm ?? {},
        affiliate_ref: input.affiliateRef ?? null,
      })
      .select('id, reference')
      .single();

    if (bookingError || !booking) throw bookingError ?? new Error('Booking insert failed');

    const { error: itemsError } = await admin.from('booking_items').insert(
      cart.lines.map((line, index) => ({
        booking_id: booking.id,
        tour_id: line.tourId,
        option_id: line.optionId,
        departure_id: line.departureId,
        starts_at: line.startsAt,
        seats: line.seats,
        pax_breakdown: line.paxBreakdown,
        unit_prices: line.unitPrices,
        line_subtotal: line.lineSubtotal,
        line_discount: line.lineDiscount,
        line_total: line.lineTotal,
        commission_rate: line.commissionRate,
        pickup_point_id: input.items[index]?.pickupPointId ?? null,
        pickup_note: input.items[index]?.pickupNote ?? null,
      })),
    );
    if (itemsError) throw itemsError;

    return {
      bookingId: booking.id,
      reference: booking.reference,
      amountDue,
      currency: cart.currency,
      holdExpiresAt,
      cart,
    };
  } catch (error) {
    // Roll the holds back so the inventory is immediately resellable.
    await Promise.all(
      held.map(({ departureId, seats }) =>
        admin.rpc('release_seats', { p_departure_id: departureId, p_seats: seats, p_convert: false }),
      ),
    );
    throw error;
  }
}

/**
 * Called only by the payment webhook, after the provider's signature has
 * been verified. Confirmation itself is a single Postgres transaction.
 */
export async function confirmPaidBooking(
  admin: Db,
  bookingId: string,
  payment: {
    provider: string;
    intentId: string;
    chargeId?: string;
    amount: number;
    currency: string;
    providerFee?: number;
    cardBrand?: string;
    cardLast4?: string;
  },
) {
  await admin.from('payments').upsert(
    {
      booking_id: bookingId,
      provider: payment.provider,
      status: 'captured',
      currency: payment.currency,
      amount: payment.amount,
      amount_captured: payment.amount,
      provider_intent_id: payment.intentId,
      provider_charge_id: payment.chargeId ?? null,
      provider_fee: payment.providerFee ?? null,
      card_brand: payment.cardBrand ?? null,
      card_last4: payment.cardLast4 ?? null,
      captured_at: new Date().toISOString(),
    },
    { onConflict: 'provider,provider_intent_id' },
  );

  // confirm_booking flips held seats to booked, issues tickets and records
  // coupon redemption in one transaction. It is idempotent, so a webhook
  // delivered twice is safe.
  const { data, error } = await admin.rpc('confirm_booking', { p_booking_id: bookingId });
  if (error) throw error;

  return data;
}

/**
 * Cancellation refund maths. The policy on the booking decides the penalty;
 * the traveller sees the number before they confirm.
 */
export function calculateRefund(
  policy: string,
  grandTotal: number,
  hoursUntilDeparture: number,
): { refundable: number; penalty: number; reason: string } {
  const thresholds: Record<string, number> = {
    flexible_24h: 24, moderate_48h: 48, standard_72h: 72, strict: 168, non_refundable: Infinity,
  };
  const threshold = thresholds[policy] ?? 48;

  if (policy === 'non_refundable') {
    return { refundable: 0, penalty: grandTotal, reason: 'This experience is non-refundable.' };
  }
  if (hoursUntilDeparture >= threshold) {
    return { refundable: grandTotal, penalty: 0, reason: `Cancelled more than ${threshold}h before departure.` };
  }
  if (hoursUntilDeparture >= threshold / 2) {
    const refundable = Math.round(grandTotal * 50) / 100;
    return { refundable, penalty: grandTotal - refundable, reason: '50% applies inside the free-cancellation window.' };
  }
  return { refundable: 0, penalty: grandTotal, reason: 'Cancelled too close to departure for a refund.' };
}
