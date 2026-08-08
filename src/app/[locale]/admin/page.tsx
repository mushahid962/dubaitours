import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Inbox, Package, Users, Star, FileText, TrendingUp } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  const supabase = await getSupabaseServerClient();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [bookings, stats, tours, applications, leads, reviews] = await Promise.all([
    supabase.from('bookings')
      .select('grand_total, commission_total, currency, status')
      .gte('created_at', monthStart.toISOString())
      .in('status', ['confirmed', 'completed']),
    supabase.from('homepage_stats').select('*').maybeSingle(),
    supabase.from('tours').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
    supabase.from('company_applications').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_review']),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const rows = (bookings.data ?? []) as unknown as Array<Record<string, any>>;
  const gross = rows.reduce((t, r) => t + Number(r.grand_total ?? 0), 0);
  const commission = rows.reduce((t, r) => t + Number(r.commission_total ?? 0), 0);
  const currency = String(rows[0]?.currency ?? 'AED');
  const site = (stats.data ?? {}) as unknown as Record<string, any>;

  // Work waiting on a human, ordered by how much it costs to leave undone.
  // An unreviewed listing is a supplier who cannot sell; a pending review is
  // a page that looks abandoned.
  const queue = [
    { label: 'Listings awaiting review', count: tours.count ?? 0, href: `${prefix}/admin/tours`, icon: Package },
    { label: 'Partner applications', count: applications.count ?? 0, href: `${prefix}/admin/applications`, icon: Users },
    { label: 'New leads', count: leads.count ?? 0, href: `${prefix}/admin/leads`, icon: Inbox },
    { label: 'Reviews to moderate', count: reviews.count ?? 0, href: `${prefix}/admin/tours`, icon: Star },
  ].filter((item) => item.count > 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Dashboard</h1>
      </header>

      <section aria-label="This month" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gross bookings" value={formatMoney(gross, currency, locale)} note={`${rows.length} this month`} />
        <Stat label="Platform revenue" value={formatMoney(commission, currency, locale)} note="Commission earned" icon={TrendingUp} />
        <Stat label="Live listings" value={String(site.tour_count ?? 0)} note={`${site.operator_count ?? 0} operators`} />
        <Stat label="Verified reviews" value={String(site.review_count ?? 0)}
          note={site.rating_avg ? `${Number(site.rating_avg).toFixed(2)} average` : 'None yet'} />
      </section>

      <section aria-labelledby="queue" className="flex flex-col gap-3">
        <h2 id="queue" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
          Waiting on you
        </h2>
        {queue.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 text-[var(--text-sm)] text-[var(--ink-soft)]">
            Nothing in any queue. Everything submitted has been dealt with.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {queue.map((item) => (
              <li key={item.label}>
                <Link href={item.href}
                  className="dune-lift flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                  <item.icon className="h-5 w-5 text-[var(--brass)]" aria-hidden />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span className="rounded-full bg-[var(--brass-wash)] px-2.5 py-0.5 font-semibold text-[var(--brass)]">
                    {item.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="shortcuts" className="flex flex-col gap-3">
        <h2 id="shortcuts" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">Create</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`${prefix}/admin/posts/new`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
            <FileText className="h-4 w-4" aria-hidden /> New post
          </Link>
          <Link href={`${prefix}/admin/menus`}
            className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2.5 text-[var(--text-sm)] font-semibold">
            Edit menus
          </Link>
          <Link href={`${prefix}/admin/settings/theme`}
            className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2.5 text-[var(--text-sm)] font-semibold">
            Theme &amp; CSS
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note, icon: Icon }: {
  label: string; value: string; note: string; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <span className="flex items-center gap-1.5 text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </span>
      <span className="text-[var(--text-2xl)] font-bold tabular-nums">{value}</span>
      <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{note}</span>
    </div>
  );
}
