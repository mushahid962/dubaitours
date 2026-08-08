import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { BadgeCheck, Star, Calendar } from 'lucide-react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { searchTours } from '@/services/search-repository';
import { searchParamsSchema } from '@/schemas/search';
import { buildMetadata, truncateDescription } from '@/lib/seo/metadata';
import { absolute, routes } from '@/lib/seo/routes';
import { breadcrumbSchema, graph } from '@/lib/seo/json-ld';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { ResultGrid } from '@/components/search/result-grid';

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; slug: string }> };

async function loadOperator(slug: string) {
  if (!isDatabaseConfigured()) return null;
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('companies')
    .select('id, slug, display_name, about, logo_url, verification, rating_avg, rating_count, onboarded_at, status, response_time_mins')
    .eq('slug', slug).eq('status', 'active').maybeSingle();
  return (data as unknown as Record<string, any>) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const operator = await loadOperator(slug);
  if (!operator) return { robots: { index: false, follow: false } };

  return buildMetadata({
    locale,
    title: `${operator.display_name} — tours and reviews`,
    description: truncateDescription(operator.about ?? `Book experiences with ${operator.display_name}.`),
    path: (candidate) => (candidate === locale ? routes.company(candidate, slug) : null),
  });
}

/**
 * Operator profile. This page is E-E-A-T infrastructure as much as it is a
 * storefront: licence status, years operating and a real review count are the
 * signals that separate a verified marketplace from a directory of scrapes.
 */
export default async function OperatorPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const operator = await loadOperator(slug);
  if (!operator) notFound();

  const parsed = searchParamsSchema.parse({});
  const supabase = getSupabasePublicClient();
  const { data: indexRows } = await supabase
    .from('tour_search_index')
    .select('*')
    .eq('locale', locale)
    .eq('company_id', operator.id)
    .order('popularity_score', { ascending: false })
    .limit(24);

  const results = ((indexRows ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.tour_id), slug: String(row.slug), title: String(row.title),
    summary: row.summary ?? null, cityName: String(row.city_name),
    countryName: String(row.country_name), companyName: String(row.company_name),
    durationMinutes: Number(row.duration_minutes), fromPrice: Number(row.from_price),
    currency: String(row.currency), discountPct: Number(row.discount_pct ?? 0),
    ratingAvg: Number(row.rating_avg ?? 0), ratingCount: Number(row.rating_count ?? 0),
    confirmation: String(row.confirmation), pickupIncluded: Boolean(row.pickup_included),
    coverUrl: row.cover_url ?? null, coverAlt: row.cover_alt ?? null,
    coverBlurhash: row.cover_blurhash ?? null, categoryNames: row.category_names ?? [],
  }));

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: operator.display_name, path: routes.company(locale, slug) },
  ];

  const yearsListed = operator.onboarded_at
    ? Math.max(1, new Date().getFullYear() - new Date(operator.onboarded_at).getFullYear())
    : null;

  return (
    <>
      <JsonLd id="operator" data={graph(
        breadcrumbSchema(trail),
        {
          '@type': 'Organization',
          '@id': `${absolute(routes.company(locale, slug))}#operator`,
          name: operator.display_name,
          description: operator.about,
          url: absolute(routes.company(locale, slug)),
          logo: operator.logo_url ?? undefined,
          ...(operator.rating_count > 0 && {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(operator.rating_avg).toFixed(1),
              reviewCount: operator.rating_count,
              bestRating: 5,
            },
          }),
        },
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <Breadcrumbs trail={trail} />

        <header className="flex flex-wrap items-start gap-5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
          {operator.logo_url && (
            <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-lg)]">
              <Image src={operator.logo_url} alt="" fill sizes="80px" className="object-cover" />
            </span>
          )}
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
              {operator.display_name}
              {operator.verification !== 'none' && (
                <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--brass-wash)] px-2.5 py-1 text-[var(--text-xs)] font-semibold text-[var(--brass)]">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Licence verified
                </span>
              )}
            </h1>
            {operator.about && <p className="max-w-2xl text-[var(--ink-soft)]">{operator.about}</p>}
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--text-sm)]">
              {operator.rating_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-[var(--brass)] text-[var(--brass)]" aria-hidden />
                  <dt className="sr-only">Rating</dt>
                  <dd><strong>{Number(operator.rating_avg).toFixed(1)}</strong>
                    <span className="text-[var(--ink-faint)]"> · {operator.rating_count} reviews</span></dd>
                </div>
              )}
              {yearsListed && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden />
                  <dt className="sr-only">Listed since</dt>
                  <dd className="text-[var(--ink-soft)]">
                    {yearsListed} {yearsListed === 1 ? 'year' : 'years'} on TravelHub Gulf
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        <section aria-labelledby="tours" className="flex flex-col gap-4">
          <h2 id="tours" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
            Experiences from {operator.display_name}
          </h2>
          <ResultGrid results={results} locale={locale} params={parsed}
            basePath={routes.company(locale, slug)} page={1} pageCount={1} configured />
        </section>
      </div>
    </>
  );
}
