import { z } from 'zod';

/**
 * Search state lives entirely in the URL.
 *
 * That is a deliberate constraint: a filtered listing must be shareable,
 * bookmarkable, back-button-safe and crawlable. Filter state held in React
 * would break all four.
 *
 * Everything is `.catch()`-guarded, so a malformed or hand-edited query
 * string degrades to the default rather than throwing a 500 at a visitor who
 * arrived from a broken link.
 */
export const SORT_OPTIONS = [
  'recommended', 'popularity', 'price_asc', 'price_desc', 'rating', 'duration_asc', 'discount', 'newest',
] as const;

export const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  category: z.string().trim().max(80).optional().catch(undefined),
  city: z.string().trim().max(80).optional().catch(undefined),

  minPrice: z.coerce.number().min(0).max(100_000).optional().catch(undefined),
  maxPrice: z.coerce.number().min(0).max(100_000).optional().catch(undefined),
  minRating: z.coerce.number().min(0).max(5).optional().catch(undefined),
  maxDuration: z.coerce.number().int().min(30).max(20_160).optional().catch(undefined),

  language: z.enum(['en', 'ar', 'hi', 'ur']).optional().catch(undefined),
  dayPart: z.enum(['morning', 'afternoon', 'evening', 'night', 'full_day']).optional().catch(undefined),

  pickup: z.coerce.boolean().optional().catch(undefined),
  instant: z.coerce.boolean().optional().catch(undefined),
  private: z.coerce.boolean().optional().catch(undefined),
  family: z.coerce.boolean().optional().catch(undefined),
  luxury: z.coerce.boolean().optional().catch(undefined),
  deals: z.coerce.boolean().optional().catch(undefined),

  sort: z.enum(SORT_OPTIONS).default('recommended').catch('recommended'),
  page: z.coerce.number().int().min(1).max(200).default(1).catch(1),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** Filters that, when set, mean the page should not be indexed. */
const NON_INDEXABLE_KEYS = [
  'q', 'minPrice', 'maxPrice', 'minRating', 'maxDuration', 'language', 'dayPart',
  'private', 'luxury', 'deals', 'sort',
] as const;

/**
 * Faceted URLs multiply combinatorially. Indexing them spends crawl budget on
 * near-duplicates and buries the pages with real demand, so anything beyond
 * page 1 or a single curated facet is noindex,follow — crawlable, not indexed.
 */
export function shouldIndex(params: SearchParams): boolean {
  if (params.page > 1) return false;
  if (params.sort !== 'recommended') return false;
  return !NON_INDEXABLE_KEYS.some((key) => params[key] !== undefined);
}

/** Rebuilds a query string with one filter changed — used by every control. */
export function buildQuery(current: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...current, ...patch };
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (key === 'sort' && value === 'recommended') continue;
    // Changing any filter resets to page 1; keeping the old page number is
    // how people land on an empty page 7 of a 2-page result set.
    if (key === 'page' && (value === 1 || Object.keys(patch).some((k) => k !== 'page'))) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function activeFilterCount(params: SearchParams): number {
  return NON_INDEXABLE_KEYS.filter((key) => key !== 'sort' && params[key] !== undefined).length
    + (params.pickup ? 1 : 0) + (params.instant ? 1 : 0) + (params.family ? 1 : 0)
    + (params.category ? 1 : 0);
}
