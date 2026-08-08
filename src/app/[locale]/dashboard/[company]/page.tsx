import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TrendingUp, TrendingDown, Package, CalendarDays, AlertCircle } from 'lucide-react';
import { getCompanyBySlug, getDashboardData } from '@/services/dashboard-repository';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { formatMoney, formatDate } from '@/lib/format';
import { TourTable } from '@/components/dashboard/tour-table';

export const dynamic = 'force-dynamic';

export default async function DashboardOverview({
  params,
}: { params: Promise<{ locale: string; company: string }> }) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const basePath = `${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/dashboard/${slug}`;

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const data = await getDashboardData(company.id, locale);
  if (!data) notFound();

  const { kpis, tours, recentBookings, unansweredReviews } = data;
  const change = kpis.bookingsLastMonth > 0
    ? Math.round(((kpis.bookingsThisMonth - kpis.bookingsLastMonth) / kpis.bookingsLastMonth) * 100)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="This month" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="You earn this month"
          value={formatMoney(kpis.netThisMonth, kpis.currency, locale)}
          /* Net, not gross. A supplier's first question is always what lands
             in their account, and leading with gross reads as hiding the cut. */
          note={`After ${formatMoney(kpis.commissionThisMonth, kpis.currency, locale)} commission`}
        />
        <Kpi
          label="Bookings this month"
          value={String(kpis.bookingsThisMonth)}
          note={change === null ? 'No comparison yet' : `${change >= 0 ? '+' : ''}${change}% vs last month`}
          trend={change === null ? undefined : change >= 0 ? 'up' : 'down'}
        />
        <Kpi label="Seats still to fill" value={String(kpis.seatsToFill)}
          note={`${kpis.upcomingDepartures} upcoming dates`} icon={CalendarDays} />
        <Kpi label="Live listings" value={String(kpis.liveTours)}
          note={`${kpis.draftTours} draft · ${kpis.inReviewTours} in review`} icon={Package} />
      </section>

      {unansweredReviews.length > 0 && (
        <section aria-labelledby="reviews-todo" className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-5">
          <h2 id="reviews-todo" className="flex items-center gap-2 text-[var(--text-lg)] font-semibold">
            <AlertCircle className="h-5 w-5 text-[var(--brass)]" aria-hidden />
            {unansweredReviews.length} review{unansweredReviews.length === 1 ? '' : 's'} without a reply
          </h2>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            Operators who reply to reviews convert better, and a reply to a critical review is read
            far more often than the review itself.
          </p>
          <Link href={`${basePath}/reviews`} className="w-fit text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
            Reply now →
          </Link>
        </section>
      )}

      <section aria-labelledby="listings" className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <h2 id="listings" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
            Your listings
          </h2>
          <Link href={`${basePath}/tours`} className="text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
            Manage all
          </Link>
        </div>
        <TourTable tours={tours.slice(0, 5)} basePath={basePath} locale={locale} />
      </section>

      <section aria-labelledby="bookings" className="flex flex-col gap-4">
        <h2 id="bookings" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
          Recent bookings
        </h2>
        {recentBookings.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 text-[var(--text-sm)] text-[var(--ink-soft)]">
            No bookings yet. They appear here the moment a traveller pays.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-lg)] bg-[var(--paper)] px-5">
            {recentBookings.map((booking) => (
              <li key={booking.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="font-medium">{booking.guestName}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--ink-faint)]">
                    {booking.reference} · {formatDate(booking.createdAt, locale)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{booking.status.replace(/_/g, ' ')}</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(booking.total, booking.currency, locale)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, note, trend, icon: Icon }: {
  label: string; value: string; note?: string;
  trend?: 'up' | 'down'; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <span className="flex items-center gap-1.5 text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </span>
      <span className="text-[var(--text-2xl)] font-bold tabular-nums">{value}</span>
      {note && (
        <span className={`flex items-center gap-1 text-[var(--text-xs)] ${
          trend === 'up' ? 'text-[var(--teal)]' : trend === 'down' ? 'text-[var(--pomegranate)]' : 'text-[var(--ink-faint)]'
        }`}>
          {trend === 'up' && <TrendingUp className="h-3.5 w-3.5" aria-hidden />}
          {trend === 'down' && <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
          {note}
        </span>
      )}
    </div>
  );
}
