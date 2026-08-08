import Link from 'next/link';
import { TourCard } from '@/components/tours/tour-card';
import type { SearchResult } from '@/services/search-repository';
import type { Locale } from '@/lib/i18n/config';
import { buildQuery, type SearchParams } from '@/schemas/search';

type Props = {
  results: SearchResult[];
  locale: Locale;
  params: SearchParams;
  basePath: string;
  page: number;
  pageCount: number;
  configured: boolean;
};

export function ResultGrid({ results, locale, params, basePath, page, pageCount, configured }: Props) {
  if (!configured) {
    return (
      <p className="rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
        No database connected yet, so there is nothing to search. Add your Supabase keys and run the
        migrations — see <code className="font-[family-name:var(--font-mono)]">docs/GETTING-STARTED.md</code>.
      </p>
    );
  }

  if (!results.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
        <h2 className="text-[var(--text-xl)] font-semibold">Nothing matched those filters</h2>
        {/* An empty state that offers a way out beats one that apologises. */}
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Try widening the price range, or clearing a filter or two.
        </p>
        <Link
          href={basePath}
          className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
        >
          Clear all filters
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result, index) => (
          <li key={result.id}>
            <TourCard
              locale={locale}
              position={(page - 1) * results.length + index + 1}
              // Only the first row is above the fold, so only the first row
              // gets priority loading. Everything else lazy-loads.
              priority={index < 3}
              tour={{
                id: result.id,
                slug: result.slug,
                title: result.title,
                summary: result.summary,
                coverUrl: result.coverUrl ?? '/placeholder-tour.svg',
                coverBlurhash: result.coverBlurhash,
                altText: result.coverAlt ?? `${result.title} in ${result.cityName}`,
                cityName: result.cityName,
                durationMinutes: result.durationMinutes,
                fromPrice: result.fromPrice,
                compareAtPrice: result.discountPct > 0
                  ? Math.round((result.fromPrice / (1 - result.discountPct / 100)) * 100) / 100
                  : null,
                currency: result.currency,
                ratingAvg: result.ratingAvg,
                ratingCount: result.ratingCount,
                instantConfirmation: result.confirmation === 'instant',
                pickupIncluded: result.pickupIncluded,
              }}
            />
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
          {/* Real <a> links, not buttons: pagination has to be crawlable, and
              rel prev/next tells crawlers these pages are a sequence. */}
          {page > 1 && (
            <Link
              rel="prev"
              href={`${basePath}${buildQuery(params, { page: page - 1 })}`}
              className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-2 text-[var(--text-sm)]"
            >
              Previous
            </Link>
          )}
          <span className="px-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link
              rel="next"
              href={`${basePath}${buildQuery(params, { page: page + 1 })}`}
              className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-2 text-[var(--text-sm)]"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
