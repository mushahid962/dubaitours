import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Lock, Clock, ArrowLeft } from 'lucide-react';
import { getBookingForCheckout } from '@/services/checkout-service';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney, formatDate } from '@/lib/format';
import { routes } from '@/lib/seo/routes';
import { HoldCountdown } from '@/components/checkout/hold-countdown';
import { PayButton } from '@/components/checkout/pay-button';

export const dynamic = 'force-dynamic';
// A checkout page contains someone's booking. It must never be indexed and
// must never be cached by a CDN.
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ cancelled?: string }>;
};

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale: raw, reference } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const { cancelled } = await searchParams;
  const booking = await getBookingForCheckout(reference, locale);
  if (!booking) notFound();

  if (booking.status === 'confirmed' || booking.status === 'completed') {
    return <AlreadyPaid reference={booking.reference} locale={locale} />;
  }
  if (booking.status === 'expired') {
    return <Expired locale={locale} />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link href={routes.home(locale)} className="inline-flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)]">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> Keep browsing
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          Confirm and pay
        </h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-faint)]">
          Booking reference <span className="font-[family-name:var(--font-mono)] font-semibold text-[var(--ink)]">{booking.reference}</span>
        </p>
      </header>

      {cancelled && (
        <p role="status" className="rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-4 text-[var(--text-sm)] text-[var(--ink-soft)]">
          You cancelled the payment. Your places are still held — you can pay below.
        </p>
      )}

      {booking.holdExpiresAt && <HoldCountdown expiresAt={booking.holdExpiresAt} />}

      <section aria-labelledby="summary" className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
        <h2 id="summary" className="text-[var(--text-xl)] font-semibold">Your booking</h2>

        <ul className="flex flex-col divide-y divide-[var(--hairline)]">
          {booking.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4 first:pt-0">
              {item.coverUrl && (
                <span className="relative h-20 w-28 shrink-0 overflow-hidden rounded-[var(--radius-md)]">
                  <Image src={item.coverUrl} alt="" fill sizes="112px" className="object-cover" />
                </span>
              )}
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-semibold">{item.tourTitle}</span>
                <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                  {formatDate(item.startsAt, locale)} · {item.seats} {item.seats === 1 ? 'traveller' : 'travellers'}
                </span>
                <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {Object.entries(item.paxBreakdown)
                    .filter(([, qty]) => qty > 0)
                    .map(([type, qty]) => `${qty} ${type}`)
                    .join(', ')}
                </span>
              </span>
              <span className="font-semibold tabular-nums">
                {formatMoney(item.lineTotal, booking.currency, locale)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-4 text-[var(--text-sm)]">
          <Row label="Subtotal" value={formatMoney(booking.subtotal, booking.currency, locale)} />
          {booking.discountTotal > 0 && (
            <Row
              label={booking.couponCode ? `Discount (${booking.couponCode})` : 'Discount'}
              value={`− ${formatMoney(booking.discountTotal, booking.currency, locale)}`}
              accent
            />
          )}
          {booking.walletApplied > 0 && (
            <Row label="Wallet credit" value={`− ${formatMoney(booking.walletApplied, booking.currency, locale)}`} accent />
          )}
          {booking.taxTotal > 0 && (
            <Row label="Includes VAT" value={formatMoney(booking.taxTotal, booking.currency, locale)} muted />
          )}
          <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-[var(--text-xl)] font-bold">
            <dt>Total due</dt>
            <dd className="tabular-nums">{formatMoney(booking.amountDue, booking.currency, locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
        <h2 className="text-[var(--text-xl)] font-semibold">Lead traveller</h2>
        <dl className="grid gap-2 text-[var(--text-sm)] sm:grid-cols-3">
          <Field label="Name" value={booking.guestName} />
          <Field label="Email" value={booking.guestEmail} />
          <Field label="Phone" value={booking.guestPhone} />
        </dl>
        <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
          Your ticket and the operator's pickup details go to this email.
        </p>
      </section>

      <PayButton
        reference={booking.reference}
        locale={locale}
        amountLabel={formatMoney(booking.amountDue, booking.currency, locale)}
      />

      <p className="flex items-center justify-center gap-1.5 text-center text-[var(--text-xs)] text-[var(--ink-faint)]">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Card details are entered on Stripe's secure page and never reach our servers.
      </p>
    </div>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-[var(--ink-faint)]' : 'text-[var(--ink-soft)]'}>{label}</dt>
      <dd className={`tabular-nums ${accent ? 'text-[var(--teal)]' : muted ? 'text-[var(--ink-faint)]' : ''}`}>{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function AlreadyPaid({ reference, locale }: { reference: string; locale: Locale }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">This booking is already paid</h1>
      <p className="text-[var(--ink-soft)]">You will not be charged again.</p>
      <Link
        href={`${locale === 'en' ? '' : `/${locale}`}/booking/${reference}`}
        className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
      >
        View your ticket
      </Link>
    </div>
  );
}

function Expired({ locale }: { locale: Locale }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Your places were released</h1>
      {/* Say what happened and what it cost them — nothing — before offering
          the way back. */}
      <p className="text-[var(--ink-soft)]">
        Places are held for 15 minutes during checkout, and that window has passed.
        You were not charged. The experience may still have availability.
      </p>
      <Link
        href={routes.search(locale)}
        className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
      >
        Search again
      </Link>
    </div>
  );
}
