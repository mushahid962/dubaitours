import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, fromStripeAmount, isPaymentsConfigured } from '@/lib/payments/stripe';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { confirmPaidBooking } from '@/services/booking-service';

// Signature verification needs the raw body, so this route must never be
// statically analysed or cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stripe webhook — the only thing in the system that may confirm a booking.
 *
 * Four rules, each of which has burned somebody's marketplace:
 *
 *  1. Verify the signature before parsing anything. An unverified webhook
 *     endpoint is a public API for marking bookings paid.
 *  2. Record every event id before acting. Stripe retries on any non-2xx,
 *     and at-least-once delivery means duplicates are normal, not an edge case.
 *  3. Re-check the amount. A session can be tampered with between creation
 *     and payment; confirming without comparing what was actually charged
 *     means honouring whatever the customer decided to pay.
 *  4. Return 200 for anything we have handled or will never handle. Returning
 *     500 for an event type we ignore makes Stripe retry it for three days.
 */
export async function POST(request: NextRequest) {
  if (!isPaymentsConfigured() || !isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET missing — refusing to trust this request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // Do not log the payload: an unverified body is attacker-controlled.
    console.warn('[webhook] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Claim the event. The unique index on (provider, event_id) means a
  // duplicate delivery loses the race and exits without doing the work twice.
  const { error: claimError } = await admin
    .from('payment_events')
    .insert({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[webhook] could not record event', claimError);
    return NextResponse.json({ error: 'Storage failure' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSessionCompleted(event.data.object as Stripe.Checkout.Session, admin);
        break;

      case 'checkout.session.expired':
        await handleSessionExpired(event.data.object as Stripe.Checkout.Session, admin);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object as Stripe.Charge, admin);
        break;

      case 'payment_intent.payment_failed':
        await handleFailure(event.data.object as Stripe.PaymentIntent, admin);
        break;

      default:
        // Acknowledged and ignored. Stripe sends dozens of event types.
        break;
    }

    await admin.from('payment_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'stripe').eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] handler failed', event.type, message);

    await admin.from('payment_events')
      .update({ error: message })
      .eq('provider', 'stripe').eq('event_id', event.id);

    // 500 asks Stripe to retry. The event row is already marked with the
    // error, and the retry will hit the duplicate guard — so a human must
    // look at any row with `error` set and `processed_at` null.
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

async function handleSessionCompleted(session: Stripe.Checkout.Session, admin: ReturnType<typeof getSupabaseAdminClient>) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) throw new Error('Session has no booking_id in metadata');

  if (session.payment_status !== 'paid') {
    // Async methods can complete the session before the money arrives.
    // `checkout.session.async_payment_succeeded` finishes those.
    return;
  }

  const { data: booking } = await admin
    .from('bookings')
    .select('id, amount_due, currency, status')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const row = booking as unknown as { amount_due: string; currency: string; status: string };
  const paid = fromStripeAmount(session.amount_total ?? 0, session.currency ?? row.currency);
  const expected = Number(row.amount_due);

  // Tolerance of one minor unit absorbs rounding; anything larger is a
  // mismatch and must not silently confirm a booking.
  if (Math.abs(paid - expected) > 0.01) {
    throw new Error(
      `Amount mismatch on ${bookingId}: charged ${paid} ${session.currency}, expected ${expected} ${row.currency}`,
    );
  }

  await confirmPaidBooking(admin, bookingId, {
    provider: 'stripe',
    intentId: String(session.payment_intent ?? session.id),
    amount: paid,
    currency: (session.currency ?? row.currency).toUpperCase(),
  });
}

async function handleSessionExpired(session: Stripe.Checkout.Session, admin: ReturnType<typeof getSupabaseAdminClient>) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;

  // Release the seats immediately rather than waiting for the reaper — an
  // expired Stripe session is a definite abandonment.
  const { data: items } = await admin
    .from('booking_items').select('departure_id, seats').eq('booking_id', bookingId);

  for (const item of (items ?? []) as unknown as Array<{ departure_id: string; seats: number }>) {
    await admin.rpc('release_seats', {
      p_departure_id: item.departure_id, p_seats: item.seats, p_convert: false,
    });
  }

  await admin.from('bookings')
    .update({ status: 'expired', hold_expires_at: null })
    .eq('id', bookingId)
    .in('status', ['pending', 'awaiting_payment']);
}

async function handleRefund(charge: Stripe.Charge, admin: ReturnType<typeof getSupabaseAdminClient>) {
  const bookingId = charge.metadata?.booking_id;
  if (!bookingId) return;

  const refunded = fromStripeAmount(charge.amount_refunded, charge.currency);
  const total = fromStripeAmount(charge.amount, charge.currency);

  await admin.from('payments')
    .update({
      amount_refunded: refunded,
      status: refunded >= total ? 'refunded' : 'partially_refunded',
    })
    .eq('provider', 'stripe')
    .eq('provider_charge_id', charge.id);

  if (refunded >= total) {
    await admin.from('bookings')
      .update({ status: 'cancelled_by_user', cancelled_at: new Date().toISOString() })
      .eq('id', bookingId);
  }
}

async function handleFailure(intent: Stripe.PaymentIntent, admin: ReturnType<typeof getSupabaseAdminClient>) {
  const bookingId = intent.metadata?.booking_id;
  if (!bookingId) return;

  // The booking stays held. A declined card is usually retried within the
  // hold window, and cancelling on the first failure loses real bookings.
  await admin.from('payments').upsert(
    {
      booking_id: bookingId,
      provider: 'stripe',
      status: 'failed',
      currency: intent.currency.toUpperCase(),
      amount: fromStripeAmount(intent.amount, intent.currency),
      provider_intent_id: intent.id,
      failure_code: intent.last_payment_error?.code ?? null,
      failure_message: intent.last_payment_error?.message ?? null,
    },
    { onConflict: 'provider,provider_intent_id' },
  );
}
