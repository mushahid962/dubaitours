import 'server-only';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { getStripe, toStripeAmount } from '@/lib/payments/stripe';
import { SITE_URL } from '@/lib/seo/routes';
import type { Locale } from '@/lib/i18n/config';

export type CheckoutBooking = {
  id: string;
  reference: string;
  status: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountDue: number;
  walletApplied: number;
  couponCode: string | null;
  holdExpiresAt: string | null;
  companyName: string;
  items: Array<{
    id: string;
    tourTitle: string;
    tourSlug: string;
    optionName: string;
    startsAt: string;
    seats: number;
    paxBreakdown: Record<string, number>;
    lineTotal: number;
    coverUrl: string | null;
    cityName: string;
    ticketCode: string | null;
  }>;
};

/**
 * Loads a booking for checkout or confirmation.
 *
 * Uses the service-role client on purpose. Guest checkout has no session, so
 * RLS would return nothing — the booking reference IS the credential. That
 * makes two things mandatory:
 *
 *   1. references are high-entropy (8 chars from a 32-symbol alphabet, no
 *      lookalikes) and generated in the database, and
 *   2. anything beyond the checkout summary requires the email as well.
 *
 * Never widen what this returns without re-reading that second point.
 */
export async function getBookingForCheckout(
  reference: string,
  locale: Locale,
): Promise<CheckoutBooking | null> {
  if (!isDatabaseConfigured()) return null;

  const admin = getSupabaseAdminClient();

  const { data } = await admin
    .from('bookings')
    .select(`
      id, reference, status, guest_name, guest_email, guest_phone, currency,
      subtotal, discount_total, tax_total, grand_total, amount_due, wallet_applied,
      coupon_code, hold_expires_at,
      company:companies ( display_name ),
      items:booking_items (
        id, starts_at, seats, pax_breakdown, line_total, ticket_code,
        tour:tours ( id ),
        option:tour_options ( code )
      )
    `)
    .eq('reference', reference.toUpperCase())
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as Record<string, any>;
  const items = (row.items ?? []) as Array<Record<string, any>>;

  // Titles and cover art come from the search index — one query for the lot.
  const tourIds = items.map((item) => item.tour?.id).filter(Boolean);
  const { data: indexRows } = tourIds.length
    ? await admin
        .from('tour_search_index')
        .select('tour_id, title, slug, cover_url, city_name')
        .eq('locale', locale)
        .in('tour_id', tourIds)
    : { data: [] };

  const byTour = new Map(
    ((indexRows ?? []) as unknown as Array<Record<string, any>>).map((r) => [String(r.tour_id), r]),
  );

  return {
    id: String(row.id),
    reference: String(row.reference),
    status: String(row.status),
    guestName: String(row.guest_name),
    guestEmail: String(row.guest_email),
    guestPhone: String(row.guest_phone),
    currency: String(row.currency),
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discount_total),
    taxTotal: Number(row.tax_total),
    grandTotal: Number(row.grand_total),
    amountDue: Number(row.amount_due),
    walletApplied: Number(row.wallet_applied),
    couponCode: row.coupon_code ?? null,
    holdExpiresAt: row.hold_expires_at ?? null,
    companyName: row.company?.display_name ?? '',
    items: items.map((item) => {
      const indexed = byTour.get(String(item.tour?.id));
      return {
        id: String(item.id),
        tourTitle: indexed?.title ?? 'Experience',
        tourSlug: indexed?.slug ?? '',
        optionName: item.option?.code ?? '',
        startsAt: String(item.starts_at),
        seats: Number(item.seats),
        paxBreakdown: (item.pax_breakdown ?? {}) as Record<string, number>,
        lineTotal: Number(item.line_total),
        coverUrl: indexed?.cover_url ?? null,
        cityName: indexed?.city_name ?? '',
        ticketCode: item.ticket_code ?? null,
      };
    }),
  };
}

/**
 * Confirmation and ticket details require the reference *and* the email that
 * booked it. A reference alone gets you the checkout summary; it does not get
 * you someone's phone number and QR codes.
 */
export async function getBookingForTraveller(
  reference: string,
  email: string,
  locale: Locale,
): Promise<CheckoutBooking | null> {
  const booking = await getBookingForCheckout(reference, locale);
  if (!booking) return null;
  if (booking.guestEmail.toLowerCase() !== email.trim().toLowerCase()) return null;
  return booking;
}

/**
 * Creates a Stripe Checkout Session and returns its URL.
 *
 * Hosted Checkout rather than an on-site card form: Stripe collects the card
 * on their domain, so no card data ever reaches our servers and PCI scope
 * stays at SAQ-A. It also gives us Apple Pay and Google Pay with no extra work.
 */
export async function createCheckoutSession(
  booking: CheckoutBooking,
  locale: Locale,
): Promise<{ url: string }> {
  const stripe = getStripe();

  if (booking.status === 'confirmed') {
    throw new CheckoutError('ALREADY_PAID', 'This booking is already confirmed.');
  }
  if (booking.holdExpiresAt && new Date(booking.holdExpiresAt) < new Date()) {
    throw new CheckoutError('HOLD_EXPIRED', 'Your places were released. Please choose your date again.');
  }
  if (booking.amountDue <= 0) {
    throw new CheckoutError('NOTHING_TO_PAY', 'There is nothing left to pay on this booking.');
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      // Stripe expires the session with the seat hold, so an abandoned
      // checkout cannot be paid after the seats have gone back on sale.
      expires_at: booking.holdExpiresAt
        ? Math.floor(new Date(booking.holdExpiresAt).getTime() / 1000)
        : undefined,
      customer_email: booking.guestEmail,
      client_reference_id: booking.reference,
      // Stripe Checkout has no Arabic, Hindi or Urdu locale — its supported
      // list is Latin-script European plus CJK and Thai. So an Arabic-speaking
      // traveller reads the whole site in Arabic and then pays on an English
      // page, which is a real weak point given that Arabic is the core market
      // strategy. 'auto' at least matches their browser where Stripe can.
      //
      // The fix is not a translation string: it is either Stripe Elements
      // embedded in our own RTL page, or a regional gateway (Tap, HyperPay)
      // that renders Arabic natively. Tracked in docs/ROADMAP.md.
      locale: 'auto',
      line_items: booking.items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: toStripeAmount(item.lineTotal, booking.currency),
          product_data: {
            name: item.tourTitle,
            description: `${item.seats} ${item.seats === 1 ? 'traveller' : 'travellers'} · ${new Date(item.startsAt).toDateString()}`,
            images: item.coverUrl ? [item.coverUrl] : undefined,
          },
        },
      })),
      // The webhook is the source of truth for confirmation. These IDs are how
      // it finds the booking without trusting anything in the redirect URL.
      metadata: {
        booking_id: booking.id,
        booking_reference: booking.reference,
      },
      payment_intent_data: {
        metadata: { booking_id: booking.id, booking_reference: booking.reference },
      },
      success_url: `${SITE_URL}${locale === 'en' ? '' : `/${locale}`}/booking/${booking.reference}?paid=1`,
      cancel_url: `${SITE_URL}${locale === 'en' ? '' : `/${locale}`}/checkout/${booking.reference}?cancelled=1`,
    },
    // Stripe-level idempotency: a double-clicked pay button returns the same
    // session instead of creating a second one.
    { idempotencyKey: `checkout:${booking.id}:${booking.amountDue}` },
  );

  if (!session.url) throw new CheckoutError('SESSION_FAILED', 'Stripe did not return a payment link.');
  return { url: session.url };
}

export class CheckoutError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}
