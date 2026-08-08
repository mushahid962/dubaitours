import Link from 'next/link';
import { SlidersHorizontal, X } from 'lucide-react';
import { buildQuery, activeFilterCount, SORT_OPTIONS, type SearchParams } from '@/schemas/search';
import type { Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';

type Props = {
  params: SearchParams;
  basePath: string;
  locale: Locale;
  currency: string;
  total: number;
  facets: { categories: Array<{ name: string; count: number }>; priceRange: { min: number; max: number } | null };
};

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  recommended: 'Recommended',
  popularity: 'Most booked',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Best rated',
  duration_asc: 'Shortest first',
  discount: 'Biggest discount',
  newest: 'Newest',
};

const TOGGLES = [
  { key: 'instant', label: 'Instant confirmation' },
  { key: 'pickup', label: 'Hotel pickup' },
  { key: 'family', label: 'Family friendly' },
  { key: 'private', label: 'Private tour' },
  { key: 'deals', label: 'On offer' },
] as const;

/**
 * Filters as links, not form state.
 *
 * Every control is an <a> that changes the query string, which means the whole
 * bar works before JavaScript loads, the back button behaves, and a filtered
 * view can be shared or crawled. It also keeps this a Server Component — no
 * hydration cost on a page whose job is to render a lot of cards fast.
 */
export function FilterBar({ params, basePath, locale, currency, total, facets }: Props) {
  const activeCount = activeFilterCount(params);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          <strong className="text-[var(--ink)]">{total.toLocaleString(locale)}</strong>{' '}
          {total === 1 ? 'experience' : 'experiences'}
          {facets.priceRange && total > 0 && (
            <> · from {formatMoney(facets.priceRange.min, currency, locale)}</>
          )}
        </p>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden />
          <label htmlFor="sort" className="sr-only">Sort results</label>
          {/* Progressive enhancement: a plain list of links wrapped in a
              <details> works without JS and needs no client component. */}
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 py-1.5 text-[var(--text-sm)] font-medium">
              {SORT_LABELS[params.sort]}
            </summary>
            <ul className="absolute end-0 z-20 mt-2 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] shadow-[var(--shadow-lift)]">
              {SORT_OPTIONS.map((option) => (
                <li key={option}>
                  <Link
                    href={`${basePath}${buildQuery(params, { sort: option, page: 1 })}`}
                    className={`block px-4 py-2 text-[var(--text-sm)] hover:bg-[var(--limestone)] ${
                      option === params.sort ? 'font-semibold text-[var(--teal)]' : ''
                    }`}
                  >
                    {SORT_LABELS[option]}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TOGGLES.map((toggle) => {
          const isOn = Boolean(params[toggle.key]);
          return (
            <Link
              key={toggle.key}
              href={`${basePath}${buildQuery(params, { [toggle.key]: isOn ? undefined : true, page: 1 })}`}
              aria-pressed={isOn}
              className={`rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[var(--text-sm)] transition-colors ${
                isOn
                  ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]'
                  : 'border-[var(--hairline)] hover:border-[var(--ink-faint)]'
              }`}
            >
              {toggle.label}
            </Link>
          );
        })}

        {facets.priceRange && facets.priceRange.max > facets.priceRange.min && (
          <Link
            href={`${basePath}${buildQuery(params, {
              maxPrice: params.maxPrice ? undefined : Math.round(facets.priceRange.min * 2),
              page: 1,
            })}`}
            aria-pressed={params.maxPrice !== undefined}
            className={`rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[var(--text-sm)] ${
              params.maxPrice !== undefined
                ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]'
                : 'border-[var(--hairline)]'
            }`}
          >
            Under {formatMoney(params.maxPrice ?? facets.priceRange.min * 2, currency, locale)}
          </Link>
        )}

        {activeCount > 0 && (
          <Link
            href={basePath}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[var(--text-sm)] text-[var(--ink-faint)] underline hover:text-[var(--ink)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear {activeCount}
          </Link>
        )}
      </div>

      {facets.categories.length > 1 && (
        <ul className="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
          {facets.categories.map((category) => (
            <li key={category.name}>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--limestone)] px-2.5 py-1 text-[var(--text-xs)] text-[var(--ink-soft)]">
                {category.name}
                <span className="text-[var(--ink-faint)]">{category.count}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
