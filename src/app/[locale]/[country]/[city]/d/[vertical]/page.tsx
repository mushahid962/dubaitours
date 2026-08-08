import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getCityBySlug } from '@/services/destination-repository';
import {
  getVerticals, getVerticalBySlug, searchDirectory, getDirectoryFacets,
  DIRECTORY_PAGE_SIZE,
} from '@/services/directory-repository';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { breadcrumbSchema, faqSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { ListingCard } from '@/components/directory/listing-card';
import { DirectoryFilters } from '@/components/directory/directory-filters';

export const revalidate = 1800;

type Props = {
  params: Promise<{ locale: string; country: string; city: string; vertical: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Parses filters from the query string, tolerating anything malformed. */
function readFilters(raw: Record<string, string | string[] | undefined>) {
  const str = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  const num = (v: unknown) => {
    const parsed = Number(str(v));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const sorts = ['recommended', 'rating', 'price_asc', 'price_desc', 'name'] as const;
  const sort = str(raw.sort);

  return {
    amenities: (str(raw.amenities) ?? '').split(',').map((a) => a.trim()).filter(Boolean).slice(0, 8),
    priceLevel: num(raw.price),
    minRating: num(raw.rating),
    sort: (sorts.includes(sort as never) ? sort : 'recommended') as (typeof sorts)[number],
    page: Math.max(1, num(raw.page) ?? 1),
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, country, city, vertical } = await params;
  if (!isLocale(locale)) return {};

  const [destination, verticalRow] = await Promise.all([
    getCityBySlug(country, city, locale),
    getVerticalBySlug(vertical, locale),
  ]);
  if (!destination || !verticalRow) return { robots: { index: false, follow: false } };

  const filters = readFilters(await searchParams);
  const fill = (template: string | null) =>
    template ? template.replace('%s', destination.name) : null;

  return buildMetadata({
    locale,
    title: fill(verticalRow.metaTitle)
      ?? composeTitle([`${verticalRow.name} in ${destination.name}`, String(new Date().getFullYear())]),
    description: fill(verticalRow.metaDescription)
      ?? truncateDescription(`Find ${verticalRow.name.toLowerCase()} in ${destination.name}.`),
    path: (candidate) =>
      candidate === locale
        ? `${candidate === DEFAULT_LOCALE ? '' : `/${candidate}`}/${country}/${city}/d/${vertical}`
        : null,
    // Only the unfiltered first page is indexable. Faceted URLs multiply
    // combinatorially and would bury the pages with real demand.
    robots: {
      index: filters.page === 1 && filters.amenities.length === 0
        && !filters.priceLevel && !filters.minRating && filters.sort === 'recommended',
      follow: true,
    },
  });
}

export default async function DirectoryPage({ params, searchParams }: Props) {
  const { locale: raw, country, city, vertical } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  if (!isDatabaseConfigured()) notFound();

  const [destination, verticals] = await Promise.all([
    getCityBySlug(country, city, locale),
    getVerticals(locale),
  ]);
  if (!destination) notFound();

  const current = verticals.find((v) => v.slug === vertical);
  if (!current) notFound();

  const filters = readFilters(await searchParams);
  const [{ listings, total, pageCount }, facets] = await Promise.all([
    searchDirectory(destination.id, current.id, filters, locale),
    getDirectoryFacets(destination.id, current.id, locale),
  ]);

  const basePath = `${prefix}/${country}/${city}/d/${vertical}`;
  const cheapest = listings.filter((l) => l.priceFrom !== null)
    .sort((a, b) => (a.priceFrom ?? 0) - (b.priceFrom ?? 0))[0];

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: destination.country.name, path: routes.country(locale, country) },
    { name: destination.name, path: routes.thingsToDo(locale, country, city) },
    { name: current.name, path: basePath },
  ];

  const faqs = total > 0 ? [
    {
      question: `How many ${current.name.toLowerCase()} are there in ${destination.name}?`,
      answer: `${total} ${current.name.toLowerCase()} ${total === 1 ? 'is' : 'are'} listed in ${destination.name}${
        cheapest?.priceFrom ? `, starting from ${formatMoney(cheapest.priceFrom, cheapest.currency ?? 'AED', locale)}` : ''}.`,
    },
    ...(current.fulfilment === 'enquiry' ? [{
      question: `Can I book ${current.name.toLowerCase()} in ${destination.name} here?`,
      answer: `Not directly. Send your requirements through the enquiry form on any listing and we come back with options and prices, usually within one working day.`,
    }] : []),
  ] : [];

  return (
    <>
      <JsonLd id="directory" data={graph(
        breadcrumbSchema(trail),
        faqSchema(faqs),
        itemListSchema(listings.slice(0, 20).map((l) => ({
          name: l.name,
          url: `${prefix}/${country}/${city}/d/${vertical}/${l.slug}`,
          image: l.imageUrl ?? undefined,
        }))),
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] md:text-[var(--text-4xl)]">
            {current.name} in {destination.name}
          </h1>
          {current.intro && (
            <p className="max-w-2xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">
              {current.intro}
            </p>
          )}
        </header>

        {/* Vertical tabs — the Klook pattern. Real links, so each is its own
            indexable URL rather than a JavaScript tab switch. */}
        <nav aria-label="Categories" className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]">
          <Link href={routes.thingsToDo(locale, country, city)}
            className="shrink-0 border-b-2 border-transparent px-4 py-2 text-[var(--text-sm)] font-medium text-[var(--ink-soft)] hover:text-[var(--ink)]">
            Overview
          </Link>
          {verticals.map((v) => (
            <Link key={v.id} href={`${prefix}/${country}/${city}/d/${v.slug}`}
              aria-current={v.slug === vertical ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-4 py-2 text-[var(--text-sm)] font-medium ${
                v.slug === vertical
                  ? 'border-[var(--teal)] text-[var(--teal)]'
                  : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
              }`}>
              {v.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-6 lg:flex-row">
          <DirectoryFilters facets={facets} basePath={basePath} params={filters} total={total} />

          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                {current.fulfilment === 'booking'
                  ? 'Bookable with instant confirmation.'
                  : current.fulfilment === 'enquiry'
                  ? 'Send your requirements and we come back with options and prices.'
                  : 'Listed for reference — opening hours and what to expect.'}
              </p>
              <nav aria-label="Sort" className="flex gap-1 text-[var(--text-sm)]">
                {([['recommended', 'Recommended'], ['rating', 'Top rated'], ['price_asc', 'Cheapest']] as const)
                  .map(([key, label]) => (
                    <Link key={key} href={key === 'recommended' ? basePath : `${basePath}?sort=${key}`}
                      className={`rounded-[var(--radius-pill)] px-3 py-1 ${
                        filters.sort === key ? 'bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]' : 'text-[var(--ink-soft)]'
                      }`}>{label}</Link>
                  ))}
              </nav>
            </div>

            {listings.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
                <h2 className="text-[var(--text-xl)] font-semibold">
                  No {current.name.toLowerCase()} listed in {destination.name} yet
                </h2>
                <p className="max-w-md text-[var(--text-sm)] text-[var(--ink-soft)]">
                  This category is live but empty here. Try another category, or another city.
                </p>
                <Link href={basePath}
                  className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
                  Clear filters
                </Link>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing, index) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} locale={locale} priority={index < 3}
                      href={`${prefix}/${country}/${city}/d/${vertical}/${listing.slug}`} />
                  </li>
                ))}
              </ul>
            )}

            {pageCount > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
                {filters.page > 1 && (
                  <Link rel="prev" href={`${basePath}?page=${filters.page - 1}`}
                    className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-2 text-[var(--text-sm)]">
                    Previous
                  </Link>
                )}
                <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                  Page {filters.page} of {pageCount}
                </span>
                {filters.page < pageCount && (
                  <Link rel="next" href={`${basePath}?page=${filters.page + 1}`}
                    className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-2 text-[var(--text-sm)]">
                    Next
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
