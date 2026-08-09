import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Plus, MapPin, EyeOff, RefreshCw } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/session';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { RefreshCounts } from '@/components/admin/refresh-counts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const LEVEL_INDENT: Record<string, string> = {
  country: '0rem', region: '1rem', city: '2rem', district: '3rem', neighborhood: '4rem', poi: '5rem',
};

export default async function AdminLocations({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ country?: string; level?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  await requirePermission(locale, 'settings.write', '/admin/locations');

  const { country, level } = await searchParams;
  const supabase = await getSupabaseServerClient();

  let query = supabase
    .from('locations')
    .select(`
      id, level, path, depth, status, display_order, is_indexable, is_featured,
      listing_count, child_count, country_code,
      translations:location_translations ( locale, name, slug, intro )
    `)
    .order('path')
    .limit(500);

  if (country) query = query.eq('country_code', country);
  if (level) query = query.eq('level', level);

  const { data } = await query;

  const rows = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => {
    const t = (row.translations ?? []).find((x: any) => x.locale === locale)
      ?? (row.translations ?? [])[0];
    return {
      id: String(row.id),
      level: String(row.level),
      depth: Number(row.depth ?? 0),
      name: t?.name ?? '(untranslated)',
      slug: t?.slug ?? '',
      hasIntro: (t?.intro?.length ?? 0) >= 250,
      status: String(row.status),
      listingCount: Number(row.listing_count ?? 0),
      childCount: Number(row.child_count ?? 0),
      isIndexable: Boolean(row.is_indexable),
      countryCode: String(row.country_code),
    };
  });

  // The same rule the database applies, mirrored so an editor can see at a
  // glance which pages are actually reaching Google and why.
  const willIndex = (r: typeof rows[number]) =>
    r.status === 'published' && r.isIndexable &&
    (r.listingCount >= 3 || r.hasIntro || (['country', 'region'].includes(r.level) && r.childCount >= 1));

  const indexed = rows.filter(willIndex).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Locations</h1>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            {rows.length} places · <strong className="text-[var(--teal)]">{indexed} indexed</strong> ·
            {' '}{rows.length - indexed} held back as thin
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshCounts />
          <Link href={`${prefix}/admin/locations/new`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
            <Plus className="h-4 w-4" aria-hidden /> New location
          </Link>
        </div>
      </header>

      <form action="" className="flex flex-wrap gap-2">
        <select name="country" defaultValue={country ?? ''}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]">
          <option value="">All countries</option>
          {['AE', 'SA', 'QA', 'OM', 'BH', 'KW'].map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select name="level" defaultValue={level ?? ''}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 text-[var(--text-sm)]">
          <option value="">All levels</option>
          {['country', 'region', 'city', 'district', 'neighborhood', 'poi'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-[var(--radius-pill)] bg-[var(--ink)] px-5 text-[var(--text-sm)] font-semibold text-[var(--salt)]">
          Filter
        </button>
      </form>

      <p className="rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
        A page is indexed when it has three or more listings, or 250+ characters of intro, or
        (for countries and regions) at least one published child. Everything else stays
        crawlable but out of the index — which is what stops six levels across six countries
        becoming a sitemap of empty pages.
      </p>

      <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-lg)] bg-[var(--paper)] px-4">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5"
            style={{ paddingInlineStart: LEVEL_INDENT[row.level] ?? '0rem' }}>
            <Link href={`${prefix}/admin/locations/${row.id}`}
              className="flex min-w-0 flex-1 items-center gap-2 font-medium hover:text-[var(--teal)]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
              <span className="truncate">{row.name}</span>
              <span className="shrink-0 text-[var(--text-xs)] capitalize text-[var(--ink-faint)]">
                {row.level}
              </span>
            </Link>

            <span className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--ink-faint)]">
              /{row.slug}
            </span>
            <span className="w-20 text-end text-[var(--text-xs)] text-[var(--ink-faint)]">
              {row.listingCount} listings
            </span>
            <span className="w-24 text-end text-[var(--text-xs)]">
              {willIndex(row) ? (
                <span className="text-[var(--teal)]">indexed</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--ink-faint)]">
                  <EyeOff className="h-3 w-3" aria-hidden /> noindex
                </span>
              )}
            </span>
            <span className="w-20 text-end text-[var(--text-xs)] capitalize text-[var(--ink-faint)]">
              {row.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
