import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCityBySlug, getCitySlugsByLocale } from '@/services/destination-repository';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { searchTours, getFacets, PAGE_SIZE } from '@/services/search-repository';
import { searchParamsSchema, shouldIndex } from '@/schemas/search';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { absolute, routes } from '@/lib/seo/routes';
import { breadcrumbSchema, faqSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { FilterBar } from '@/components/search/filter-bar';
import { ResultGrid } from '@/components/search/result-grid';
import { FaqAccordion } from '@/components/tours/faq-accordion';

export const revalidate = 1800;

type Props = {
  params: Promise<{ locale: string; country: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, country, city } = await params;
  if (!isLocale(locale)) return {};

  const destination = await getCityBySlug(country, city, locale);
  if (!destination) return { robots: { index: false, follow: false } };

  const parsed = searchParamsSchema.parse(await searchParams);
  const slugs = await getCitySlugsByLocale(destination.id);
  const year = new Date().getFullYear();

  return buildMetadata({
    locale,
    title: destination.metaTitle
      ?? composeTitle([`Things to Do in ${destination.name} ${year}`, 'Tours & Tickets']),
    description: destination.metaDescription
      ?? truncateDescription(
        `Book tours, attraction tickets and day trips in ${destination.name}. `
        + 'Verified operators, instant confirmation and free cancellation.',
      ),
    path: (candidate) => {
      const match = slugs.get(candidate);
      return match ? routes.thingsToDo(candidate, match.country, match.city) : null;
    },
    image: destination.heroImageUrl
      ? { url: destination.heroImageUrl, alt: `${destination.name} skyline` }
      : null,
    // Page 1 unfiltered is the canonical, indexable version. Every filtered
    // or paginated variant stays crawlable but out of the index.
    robots: { index: shouldIndex(parsed), follow: true },
  });
}

export default async function ThingsToDoPage({ params, searchParams }: Props) {
  const { locale: raw, country, city } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  // Without a database every city would 404, including the ones the homepage
  // links to. A "not set up yet" page is far more useful to whoever just
  // cloned this than a dead end that looks like a bug.
  if (!isDatabaseConfigured()) return <NotConfigured city={city} />;

  const destination = await getCityBySlug(country, city, locale);
  if (!destination) notFound();

  const parsed = searchParamsSchema.parse(await searchParams);
  const [response, facets] = await Promise.all([
    searchTours(parsed, locale, { cityId: destination.id }),
    getFacets(locale, destination.id),
  ]);

  const basePath = routes.thingsToDo(locale, country, city);
  const year = new Date().getFullYear();

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: destination.country.name, path: routes.country(locale, country) },
    { name: destination.name, path: routes.city(locale, country, city) },
    { name: 'Things to do', path: basePath },
  ];

  /**
   * The unique-content layer that makes a programmatic page worth indexing.
   * Every number here is computed from live inventory, so no two city pages
   * read alike and the copy stays true as the catalogue changes.
   */
  const priceLine = facets.priceRange
    ? `Prices start at ${formatMoney(facets.priceRange.min, destination.country.currency, locale)} and run to ${formatMoney(facets.priceRange.max, destination.country.currency, locale)}.`
    : '';

  const faqs = response.total > 0 ? [
    {
      question: `What are the best things to do in ${destination.name}?`,
      answer: `There are ${response.total} bookable experiences in ${destination.name} on TravelHub Gulf right now, across ${facets.categories.length} categories — the most popular being ${facets.categories.slice(0, 3).map((c) => c.name.toLowerCase()).join(', ')}. ${priceLine}`,
    },
    {
      question: `How much do tours in ${destination.name} cost?`,
      answer: priceLine || `Prices vary by operator and season in ${destination.name}.`,
    },
    ...(destination.bestTimeToVisit ? [{
      question: `When is the best time to visit ${destination.name}?`,
      answer: destination.bestTimeToVisit,
    }] : []),
    {
      question: `Can I cancel a ${destination.name} tour for free?`,
      answer: 'Most experiences allow free cancellation up to 48 hours before departure. The exact policy is shown on each tour page before you pay.',
    },
  ] : [];

  return (
    <>
      <JsonLd
        id="city"
        data={graph(
          breadcrumbSchema(trail),
          faqSchema(faqs),
          itemListSchema(
            response.results.slice(0, 20).map((result) => ({
              name: result.title,
              url: routes.tour(locale, result.slug),
              image: result.coverUrl ?? undefined,
            })),
          ),
        )}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] md:text-[var(--text-4xl)]">
            Things to do in {destination.name}
          </h1>
          {destination.intro && (
            <p className="max-w-2xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">
              {destination.intro}
            </p>
          )}
        </header>

        <FilterBar
          params={parsed} basePath={basePath} locale={locale}
          currency={destination.country.currency} total={response.total} facets={facets}
        />

        <ResultGrid
          results={response.results} locale={locale} params={parsed} basePath={basePath}
          page={response.page} pageCount={response.pageCount} configured={response.configured}
        />

        {/* Long-form copy sits below the inventory, not above it. A visitor
            came to browse; a crawler will read either way. */}
        {(destination.body || destination.bestTimeToVisit || destination.gettingAround) && (
          <section aria-labelledby="guide" className="flex flex-col gap-4 border-t border-[var(--hairline)] pt-8">
            <h2 id="guide" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              Visiting {destination.name}
            </h2>
            {destination.body && (
              <p className="max-w-3xl whitespace-pre-line leading-relaxed text-[var(--ink-soft)]">
                {destination.body}
              </p>
            )}
            <dl className="grid gap-4 sm:grid-cols-2">
              {destination.bestTimeToVisit && (
                <div className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
                  <dt className="text-[var(--text-sm)] font-semibold">Best time to visit</dt>
                  <dd className="pt-1 text-[var(--text-sm)] text-[var(--ink-soft)]">{destination.bestTimeToVisit}</dd>
                </div>
              )}
              {destination.gettingAround && (
                <div className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
                  <dt className="text-[var(--text-sm)] font-semibold">Getting around</dt>
                  <dd className="pt-1 text-[var(--text-sm)] text-[var(--ink-soft)]">{destination.gettingAround}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <FaqAccordion faqs={faqs} heading={`${destination.name} questions, answered`} />
      </div>
    </>
  );
}

function NotConfigured({ city }: { city: string }) {
  const name = city.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
        Things to do in {name}
      </h1>
      <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
        This page is ready, but there is no database connected yet, so there are no tours to show.
        Connect Supabase and run the migrations and seed file — Part 3 of{' '}
        <code className="font-[family-name:var(--font-mono)]">docs/GETTING-STARTED.md</code> — and
        this page fills itself in.
      </p>
      <a href="/" className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
        Back to home
      </a>
    </div>
  );
}
