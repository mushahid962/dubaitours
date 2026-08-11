import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategoryTree, resolveDirectoryPath } from '@/services/taxonomy-repository';
import { searchDirectory, getDirectoryFacets } from '@/services/directory-repository';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { breadcrumbSchema, faqSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { CategorySidebar } from '@/components/directory/category-sidebar';
import { FilterRail, type FilterState } from '@/components/directory/filter-rail';
import { ListingCard } from '@/components/directory/listing-card';

export const dynamic = 'force-dynamic';
export const revalidate = 1800;

type Props = {
  params: Promise<{ locale: string; country: string; city: string; category: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readFilters(raw: Record<string, string | string[] | undefined>): FilterState {
  const str = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  const num = (v: unknown) => {
    const n = Number(str(v));
    return Number.isFinite(n) ? n : null;
  };
  return {
    amenities: (str(raw.amenities) ?? '').split(',').map((a) => a.trim()).filter(Boolean).slice(0, 10),
    priceMin: num(raw.priceMin), priceMax: num(raw.priceMax),
    minRating: num(raw.rating),
    duration: str(raw.duration) ?? null,
    timeOfDay: str(raw.time) ?? null,
    availability: str(raw.when) ?? null,
    instant: str(raw.instant) === '1',
    freeCancellation: str(raw.free) === '1',
    area: str(raw.area) ?? null,
    sort: str(raw.sort) ?? 'recommended',
  };
}

const isUnfiltered = (f: FilterState) =>
  f.amenities.length === 0 && !f.priceMin && !f.priceMax && !f.minRating &&
  !f.duration && !f.timeOfDay && !f.availability && !f.instant &&
  !f.freeCancellation && !f.area && f.sort === 'recommended';

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, country, city, category, rest } = await params;
  if (!isLocale(locale)) return {};

  const sub = rest?.[0];
  const resolved = await resolveDirectoryPath(country, city, locale, category, sub);
  if (!resolved?.categoryId) return { robots: { index: false, follow: false } };
  if (sub && !resolved.subId) return { robots: { index: false, follow: false } };

  const tree = await getCategoryTree(locale);
  const cat = tree.find((c) => c.id === resolved.categoryId);
  const subCat = cat?.children?.find((c) => c.id === resolved.subId);
  const target = subCat ?? cat;
  const fill = (t: string | null | undefined) => t?.replace('%s', resolved.cityName) ?? null;

  return buildMetadata({
    locale,
    title: fill(target?.metaTitle)
      ?? composeTitle([`${target?.name ?? category} in ${resolved.cityName}`, String(new Date().getFullYear())]),
    description: fill(target?.metaDescription)
      ?? truncateDescription(`Find ${(target?.name ?? category).toLowerCase()} in ${resolved.cityName}.`),
    path: (candidate) =>
      candidate === locale
        ? `${candidate === DEFAULT_LOCALE ? '' : `/${candidate}`}/${country}/${city}/${category}${sub ? `/${sub}` : ''}`
        : null,
    // Only the unfiltered first view is indexable. Faceted URLs multiply
    // combinatorially and would bury the pages that have real demand.
    robots: { index: isUnfiltered(readFilters(await searchParams)), follow: true },
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale: raw, country, city, category, rest } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  if (!isDatabaseConfigured()) notFound();

  // Only one level of subcategory is meaningful. Anything deeper is a stray
  // link or a crawler guessing; consolidate rather than serving a duplicate.
  const sub = rest?.[0];
  if (rest && rest.length > 1) {
    permanentRedirect(`${prefix}/${country}/${city}/${category}/${sub}`);
  }

  const resolved = await resolveDirectoryPath(country, city, locale, category, sub);
  if (!resolved?.categoryId) notFound();
  if (sub && !resolved.subId) notFound();

  const filters = readFilters(await searchParams);
  const tree = await getCategoryTree(locale, resolved.cityId);
  const cat = tree.find((c) => c.id === resolved.categoryId);
  const subCat = cat?.children?.find((c) => c.id === resolved.subId);
  const target = subCat ?? cat;

  const [{ listings, total, pageCount }, facets] = await Promise.all([
    searchDirectory(resolved.cityId, null, {
      amenities: filters.amenities,
      priceLevel: null,
      minRating: filters.minRating,
      sort: (filters.sort === 'price_asc' || filters.sort === 'price_desc'
        || filters.sort === 'rating' || filters.sort === 'name')
        ? filters.sort : 'recommended',
      page: 1,
    }, locale),
    getDirectoryFacets(resolved.cityId, null, locale),
  ]);

  const basePath = `${prefix}/${country}/${city}/${category}${sub ? `/${sub}` : ''}`;
  const hrefFor = (c: string, s?: string) =>
    `${prefix}/${country}/${city}/${c}${s ? `/${s}` : ''}`;

  const cheapest = listings.filter((l) => l.priceFrom !== null)
    .sort((a, b) => (a.priceFrom ?? 0) - (b.priceFrom ?? 0))[0];
  const currency = cheapest?.currency ?? 'AED';

  const trail: Crumb[] = [
    { name: resolved.countryName, path: `${prefix}/${country}` },
    { name: resolved.cityName, path: `${prefix}/${country}/${city}` },
    { name: cat?.name ?? category, path: hrefFor(category) },
    ...(subCat ? [{ name: subCat.name, path: basePath }] : []),
  ];

  const faqs = total > 0 ? [
    {
      question: `How much ${target?.kind === 'place' ? 'do' : 'does'} ${(target?.name ?? category).toLowerCase()} in ${resolved.cityName} cost?`,
      answer: cheapest?.priceFrom
        ? `${target?.name} in ${resolved.cityName} start from ${formatMoney(cheapest.priceFrom, currency, locale)}, across ${total} listings.`
        : `Prices vary by operator in ${resolved.cityName}.`,
    },
    {
      question: `How many ${(target?.name ?? category).toLowerCase()} are there in ${resolved.cityName}?`,
      answer: `${total} ${total === 1 ? 'listing is' : 'listings are'} live in ${resolved.cityName} right now, all from licensed operators we verify before listing.`,
    },
  ] : [];

  return (
    <>
      <JsonLd id="category" data={graph(
        breadcrumbSchema(trail),
        faqSchema(faqs),
        itemListSchema(listings.slice(0, 20).map((l) => ({
          name: l.name, url: `${basePath}/${l.slug}`, image: l.imageUrl ?? undefined,
        }))),
      )} />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] md:text-[var(--text-4xl)]">
            {(target?.h1 ?? `${target?.name} in %s`).replace('%s', resolved.cityName)}
          </h1>
          {target?.intro && (
            <p className="max-w-2xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">
              {target.intro}
            </p>
          )}
        </header>

        {/* Subcategory chips above the results: the fastest route from a broad
            category to the specific search that actually converts. */}
        {!subCat && (cat?.children?.length ?? 0) > 0 && (
          <nav aria-label={`${cat?.name} types`} className="flex flex-wrap gap-2">
            {cat!.children!.map((child) => (
              <Link key={child.id} href={hrefFor(category, child.slug)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-1.5 text-[var(--text-sm)] hover:border-[var(--teal)] hover:text-[var(--teal)]">
                {child.name}
                {child.listingCount > 0 && (
                  <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{child.listingCount}</span>
                )}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex shrink-0 flex-col gap-6 lg:w-60">
            <CategorySidebar categories={tree} cityName={resolved.cityName}
              activeCategory={category} activeSub={sub} hrefFor={hrefFor} />
            <div className="hidden lg:block">
              <FilterRail facets={facets as never} basePath={basePath} state={filters}
                locale={locale} currency={currency} total={total}
                showActivityFilters={target?.kind === 'activity'} />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                {total} {total === 1 ? 'listing' : 'listings'} in {resolved.cityName}
              </p>
              <nav aria-label="Sort" className="flex gap-1 text-[var(--text-sm)]">
                {([['recommended', 'Recommended'], ['rating', 'Top rated'], ['price_asc', 'Cheapest']] as const)
                  .map(([key, label]) => (
                    <Link key={key} href={key === 'recommended' ? basePath : `${basePath}?sort=${key}`}
                      className={`rounded-[var(--radius-pill)] px-3 py-1 ${
                        filters.sort === key
                          ? 'bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]'
                          : 'text-[var(--ink-soft)]'
                      }`}>{label}</Link>
                  ))}
              </nav>
            </div>

            {/* Filters below the results on mobile, where a rail would push
                every listing off the first screen. */}
            <details className="lg:hidden">
              <summary className="cursor-pointer rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-2 text-[var(--text-sm)] font-medium">
                Filters
              </summary>
              <div className="pt-4">
                <FilterRail facets={facets as never} basePath={basePath} state={filters}
                  locale={locale} currency={currency} total={total}
                  showActivityFilters={target?.kind === 'activity'} />
              </div>
            </details>

            {listings.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
                <h2 className="text-[var(--text-xl)] font-semibold">
                  Nothing listed here yet
                </h2>
                <p className="max-w-md text-[var(--text-sm)] text-[var(--ink-soft)]">
                  {target?.name} in {resolved.cityName} is live as a category but has no listings
                  yet. Try another category in the sidebar, or clear your filters.
                </p>
                <Link href={basePath}
                  className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
                  Clear filters
                </Link>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {listings.map((listing, index) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} locale={locale} priority={index < 3}
                      href={`${basePath}/${listing.slug}`} />
                  </li>
                ))}
              </ul>
            )}

            {target?.body && (
              <section className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-8">
                <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                  {target.name} in {resolved.cityName}
                </h2>
                <p className="max-w-3xl whitespace-pre-line leading-relaxed text-[var(--ink-soft)]">
                  {target.body}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
