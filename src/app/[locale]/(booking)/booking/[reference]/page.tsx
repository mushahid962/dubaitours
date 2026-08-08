import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, Mail, Clock3 } from 'lucide-react';
import { getBookingForCheckout } from '@/services/checkout-service';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney, formatDate } from '@/lib/format';
import { routes } from '@/lib/seo/routes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ paid?: string }>;
};

export default async function BookingConfirmationPage({ params, searchParams }: Props) {
  const { locale: raw, reference } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const { paid } = await searchParams;
  const booking = await getBookingForCheckout(reference, locale);
  if (!booking) notFound();

  const isConfirmed = booking.status === 'confirmed' || booking.status === 'completed';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      {isConfirmed ? (
        <header className="flex flex-col items-start gap-3">
          <CheckCircle2 className="h-12 w-12 text-[var(--teal)]" aria-hidden />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
            You're booked, {booking.guestName.split(' ')[0]}
          </h1>
          <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
            {booking.companyName} has your booking. A confirmation is on its way to{' '}
            <strong>{booking.guestEmail}</strong>.
          </p>
        </header>
      ) : paid ? (
        /* Stripe redirects the moment the card clears, but confirmation only
           happens when the webhook lands — usually within a second or two.
           Telling the truth here beats showing a confirmation we can't back up. */
        <header className="flex flex-col items-start gap-3">
          <Clock3 className="h-12 w-12 text-[var(--brass)]" aria-hidden />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
            Payment received — confirming now
          </h1>
          <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
            Your payment went through. We're finalising the booking with {booking.companyName},
            which usually takes a few seconds. Refresh this page in a moment, or wait for the
            email — either way your places are secured.
          </p>
        </header>
      ) : (
        <header className="flex flex-col items-start gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
            Booking {booking.reference}
          </h1>
          <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
            This booking has not been paid yet.
          </p>
          <Link
            href={routes.checkout(locale, booking.reference)}
            className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
          >
            Complete payment
          </Link>
        </header>
      )}

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[var(--text-xl)] font-semibold">What you booked</h2>
          <span className="font-[family-name:var(--font-mono)] text-[var(--text-sm)] font-semibold">
            {booking.reference}
          </span>
        </div>

        <ul className="flex flex-col divide-y divide-[var(--hairline)]">
          {booking.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-4 first:pt-0">
              <span className="font-semibold">{item.tourTitle}</span>
              <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                {formatDate(item.startsAt, locale)} · {item.seats} {item.seats === 1 ? 'traveller' : 'travellers'} · {item.cityName}
              </span>
              {item.ticketCode && (
                <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-[var(--radius-md)] bg-[var(--teal-wash)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[var(--text-sm)] text-[var(--teal-deep)]">
                  Ticket {item.ticketCode.slice(0, 12).toUpperCase()}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-3 font-semibold">
          <span>Paid</span>
          <span className="tabular-nums">{formatMoney(booking.grandTotal, booking.currency, locale)}</span>
        </div>
      </section>

      <p className="flex items-start gap-2 text-[var(--text-sm)] text-[var(--ink-soft)]">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Keep reference <strong>{booking.reference}</strong> — you'll need it plus the email address
        you booked with to look this up again.
      </p>
    </div>
  );
}
