import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { searchTours, getFacets } from '@/services/search-repository';
import { searchParamsSchema, shouldIndex } from '@/schemas/search';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { FilterBar } from '@/components/search/filter-bar';
import { ResultGrid } from '@/components/search/result-grid';

// Results depend on the query string, so this is always server-rendered.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const parsed = searchParamsSchema.parse(await searchParams);
  const title = parsed.q ? `${parsed.q} — search results` : 'Search experiences across the Gulf';

  return buildMetadata({
    locale,
    title,
    description: 'Search tours, tickets and experiences across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait.',
    path: (candidate) => routes.search(candidate),
    // A search results page is generated on demand from a query the visitor
    // typed. It is not a destination worth indexing, and letting crawlers in
    // spends budget on infinite near-duplicate URLs.
    robots: { index: false, follow: true },
  });
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const parsed = searchParamsSchema.parse(await searchParams);
  const [response, facets] = await Promise.all([
    searchTours(parsed, locale),
    getFacets(locale),
  ]);

  const basePath = routes.search(locale);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          {parsed.q ? `Results for “${parsed.q}”` : 'Search experiences'}
        </h1>
        <form action={basePath} className="flex max-w-xl gap-2">
          <label htmlFor="q" className="sr-only">Search</label>
          <input
            id="q" name="q" type="search" defaultValue={parsed.q ?? ''}
            placeholder="Try “desert safari” or “AlUla”"
            className="h-12 flex-1 rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] px-5"
          />
          <button type="submit" className="h-12 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white">
            Search
          </button>
        </form>
      </header>

      <FilterBar
        params={parsed} basePath={basePath} locale={locale}
        currency="AED" total={response.total} facets={facets}
      />

      <ResultGrid
        results={response.results} locale={locale} params={parsed} basePath={basePath}
        page={response.page} pageCount={response.pageCount} configured={response.configured}
      />
    </div>
  );
}
