import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LayoutDashboard, Package, CalendarDays, Star, Wallet } from 'lucide-react';
import { getCompanyBySlug } from '@/services/dashboard-repository';
import { requireActor, isStaff } from '@/lib/auth/session';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; company: string }>;
}) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const basePath = `${prefix}/dashboard/${slug}`;

  if (!isDatabaseConfigured()) notFound();

  const actor = await requireActor(locale, basePath);
  const company = await getCompanyBySlug(slug);

  // 404, not 403. Confirming that an operator exists to someone who cannot
  // access it leaks the existence of every company on the platform.
  if (!company) notFound();
  const isMember = actor.companies.some((c) => c.id === company.id);
  if (!isMember && !isStaff(actor)) notFound();

  const nav = [
    { href: basePath, label: 'Overview', icon: LayoutDashboard },
    { href: `${basePath}/tours`, label: 'Listings', icon: Package },
    { href: `${basePath}/bookings`, label: 'Bookings', icon: CalendarDays },
    { href: `${basePath}/reviews`, label: 'Reviews', icon: Star },
    { href: `${basePath}/payouts`, label: 'Payouts', icon: Wallet },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
            {company.display_name}
          </h1>
          <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
            {company.commission_rate}% commission · paid in {company.payout_currency}
            {isStaff(actor) && !isMember && ' · viewing as staff'}
          </p>
        </div>
        <Link href={`${basePath}/tours/new`}
          className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
          New listing
        </Link>
      </header>

      <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]">
        {nav.map((item) => (
          <Link key={item.href} href={item.href}
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[var(--text-sm)] font-medium text-[var(--ink-soft)] hover:border-[var(--teal)] hover:text-[var(--teal)]">
            <item.icon className="h-4 w-4" aria-hidden /> {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
