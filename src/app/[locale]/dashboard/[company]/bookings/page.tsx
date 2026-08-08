import { notFound } from 'next/navigation';
import { Users, Phone, CheckCircle2 } from 'lucide-react';
import { getCompanyBySlug } from '@/services/dashboard-repository';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney, formatDate } from '@/lib/format';
import { CheckInScanner } from '@/components/dashboard/check-in-scanner';

export const dynamic = 'force-dynamic';

export default async function DashboardBookings({
  params, searchParams,
}: {
  params: Promise<{ locale: string; company: string }>;
  searchParams: Promise<{ when?: string }>;
}) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const { when } = await searchParams;
  const view = when === 'past' ? 'past' : 'upcoming';

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const supabase = await getSupabaseServerClient();
  const now = new Date().toISOString();

  const query = supabase.from('booking_manifest').select('*').eq('company_id', company.id);
  const { data } = view === 'upcoming'
    ? await query.gte('starts_at', now).order('starts_at', { ascending: true }).limit(200)
    : await query.lt('starts_at', now).order('starts_at', { ascending: false }).limit(100);

  const rows = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    itemId: String(row.item_id), reference: String(row.reference),
    guestName: String(row.guest_name), guestPhone: String(row.guest_phone),
    guestEmail: String(row.guest_email), seats: Number(row.seats),
    startsAt: String(row.starts_at), total: Number(row.grand_total),
    currency: String(row.currency), redeemedAt: row.redeemed_at ?? null,
    pickup: row.pickup_point ?? null, pickupNote: row.pickup_note ?? null,
    pax: (row.pax_breakdown ?? {}) as Record<string, number>,
  }));

  // Grouped by departure: a guide works one trip at a time, not one booking
  // at a time, and needs a head count per departure before anything else.
  const byDeparture = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.startsAt;
    byDeparture.set(key, [...(byDeparture.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col gap-6">
      <CheckInScanner />

      <nav aria-label="Booking period" className="flex gap-2">
        {(['upcoming', 'past'] as const).map((option) => (
          <a key={option} href={`?when=${option}`}
            aria-current={view === option ? 'page' : undefined}
            className={`rounded-[var(--radius-pill)] border px-4 py-1.5 text-[var(--text-sm)] capitalize ${
              view === option
                ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]'
                : 'border-[var(--hairline)] text-[var(--ink-soft)]'
            }`}>
            {option}
          </a>
        ))}
      </nav>

      {byDeparture.size === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          No {view} bookings. Confirmed bookings appear here the moment a traveller pays.
        </p>
      ) : (
        [...byDeparture.entries()].map(([startsAt, group]) => {
          const heads = group.reduce((total, row) => total + row.seats, 0);
          const checkedIn = group.filter((row) => row.redeemedAt).length;

          return (
            <section key={startsAt} aria-label={`Departure ${startsAt}`} className="flex flex-col gap-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
                  {formatDate(startsAt, locale)}{' '}
                  <span className="text-[var(--text-sm)] font-normal text-[var(--ink-faint)]">
                    {new Date(startsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </h2>
                <p className="flex items-center gap-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-4 w-4" aria-hidden /> {heads} travellers
                  </span>
                  {checkedIn > 0 && (
                    <span className="inline-flex items-center gap-1 text-[var(--teal)]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> {checkedIn} checked in
                    </span>
                  )}
                </p>
              </header>

              <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-lg)] bg-[var(--paper)] px-5">
                {group.map((row) => (
                  <li key={row.itemId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 font-medium">
                        {row.guestName}
                        {row.redeemedAt && <CheckCircle2 className="h-4 w-4 text-[var(--teal)]" aria-label="Checked in" />}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--ink-faint)]">
                        {row.reference}
                      </span>
                      {(row.pickup || row.pickupNote) && (
                        <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">
                          Pickup: {row.pickup ?? row.pickupNote}
                        </span>
                      )}
                    </span>

                    <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                      {Object.entries(row.pax).filter(([, q]) => q > 0)
                        .map(([type, q]) => `${q} ${type}`).join(', ')}
                    </span>

                    <a href={`tel:${row.guestPhone}`}
                      className="inline-flex items-center gap-1 text-[var(--text-sm)] text-[var(--teal)] hover:underline">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {row.guestPhone}
                    </a>

                    <span className="w-24 text-end font-semibold tabular-nums">
                      {formatMoney(row.total, row.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
