import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCityBySlug, getCategoryBySlug } from '@/services/destination-repository';
import { searchTours, getFacets } from '@/services/search-repository';
import { searchParamsSchema, shouldIndex } from '@/schemas/search';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { breadcrumbSchema, faqSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { FilterBar } from '@/components/search/filter-bar';
import { ResultGrid } from '@/components/search/result-grid';
import { FaqAccordion } from '@/components/tours/faq-accordion';

export const revalidate = 1800;

type Props = {
  params: Promise<{ locale: string; country: string; city: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, country, city, category } = await params;
  if (!isLocale(locale)) return {};

  const [destination, cat] = await Promise.all([
    getCityBySlug(country, city, locale),
    getCategoryBySlug(category, locale),
  ]);
  if (!destination || !cat) return { robots: { index: false, follow: false } };

  const parsed = searchParamsSchema.parse(await searchParams);

  return buildMetadata({
    locale,
    title: composeTitle([`${cat.name} in ${destination.name}`, `${new Date().getFullYear()} | Book Online`]),
    description: truncateDescription(
      cat.intro ?? `Book ${cat.name.toLowerCase()} experiences in ${destination.name} with free cancellation and instant confirmation.`,
    ),
    path: (candidate) =>
      candidate === locale ? routes.cityCategory(candidate, country, city, category) : null,
    robots: { index: shouldIndex(parsed), follow: true },
  });
}

/**
 * The city × category page — the workhorse of the programmatic SEO strategy.
 * "Desert safari in Dubai" is where the commercial intent actually lives, and
 * there are thousands of these across six countries.
 */
export default async function CityCategoryPage({ params, searchParams }: Props) {
  const { locale: raw, country, city, category } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  if (!isDatabaseConfigured()) notFound();

  const [destination, cat] = await Promise.all([
    getCityBySlug(country, city, locale),
    getCategoryBySlug(category, locale),
  ]);
  if (!destination || !cat) notFound();

  const parsed = searchParamsSchema.parse(await searchParams);
  const [response, facets] = await Promise.all([
    searchTours(parsed, locale, { cityId: destination.id, categoryId: cat.id }),
    getFacets(locale, destination.id),
  ]);

  const basePath = routes.cityCategory(locale, country, city, category);
  const currency = destination.country.currency;

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: destination.country.name, path: routes.country(locale, country) },
    { name: destination.name, path: routes.thingsToDo(locale, country, city) },
    { name: cat.name, path: basePath },
  ];

  const cheapest = response.results.length
    ? Math.min(...response.results.map((r) => r.fromPrice))
    : null;

  const faqs = response.total > 0 ? [
    {
      question: `How much is a ${cat.name.toLowerCase()} in ${destination.name}?`,
      answer: cheapest
        ? `${cat.name} experiences in ${destination.name} start at ${formatMoney(cheapest, currency, locale)} per adult across ${response.total} bookable options.`
        : `Prices vary by operator in ${destination.name}.`,
    },
    {
      question: `How many ${cat.name.toLowerCase()} options are there in ${destination.name}?`,
      answer: `${response.total} bookable ${cat.name.toLowerCase()} ${response.total === 1 ? 'experience is' : 'experiences are'} listed in ${destination.name} right now, all from licensed operators we verify before listing.`,
    },
  ] : [];

  return (
    <>
      <JsonLd id="city-category" data={graph(
        breadcrumbSchema(trail),
        faqSchema(faqs),
        itemListSchema(response.results.slice(0, 20).map((r) => ({
          name: r.title, url: routes.tour(locale, r.slug), image: r.coverUrl ?? undefined,
        }))),
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] md:text-[var(--text-4xl)]">
            {cat.name} in {destination.name}
          </h1>
          {cat.intro && (
            <p className="max-w-2xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">{cat.intro}</p>
          )}
        </header>

        <FilterBar params={parsed} basePath={basePath} locale={locale}
          currency={currency} total={response.total} facets={facets} />

        <ResultGrid results={response.results} locale={locale} params={parsed} basePath={basePath}
          page={response.page} pageCount={response.pageCount} configured={response.configured} />

        <FaqAccordion faqs={faqs} heading={`${cat.name} in ${destination.name}, answered`} />
      </div>
    </>
  );
}
