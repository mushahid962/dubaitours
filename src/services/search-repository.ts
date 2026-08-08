import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';
import type { SearchParams } from '@/schemas/search';

export const PAGE_SIZE = 24;

export type SearchResult = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cityName: string;
  countryName: string;
  companyName: string;
  durationMinutes: number;
  fromPrice: number;
  currency: string;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  confirmation: string;
  pickupIncluded: boolean;
  coverUrl: string | null;
  coverAlt: string | null;
  coverBlurhash: string | null;
  categoryNames: string[];
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  page: number;
  pageCount: number;
  configured: boolean;
};

/**
 * One query, every filter.
 *
 * The whole listing page reads from `tour_search_index`, which is a flat row
 * per (tour, locale) maintained by triggers. No joins at read time — that is
 * the entire reason the index exists, and why a busy city page stays fast.
 */
export const searchTours = cache(async (
  params: SearchParams,
  locale: Locale,
  scope?: { cityId?: string; categoryId?: string },
): Promise<SearchResponse> => {
  if (!isDatabaseConfigured()) {
    return { results: [], total: 0, page: 1, pageCount: 0, configured: false };
  }

  const supabase = getSupabasePublicClient();
  const from = (params.page - 1) * PAGE_SIZE;

  let query = supabase
    .from('tour_search_index')
    .select('*', { count: 'exact' })
    .eq('locale', locale);

  if (scope?.cityId) query = query.eq('city_id', scope.cityId);
  if (scope?.categoryId) query = query.contains('category_ids', [scope.categoryId]);

  // Full-text first, trigram as the safety net. `websearch_to_tsquery` handles
  // quoted phrases and OR the way people actually type into a search box.
  if (params.q) {
    query = query.textSearch('document', params.q, { type: 'websearch', config: 'simple' });
  }

  if (params.minPrice !== undefined) query = query.gte('from_price', params.minPrice);
  if (params.maxPrice !== undefined) query = query.lte('from_price', params.maxPrice);
  if (params.minRating !== undefined) query = query.gte('rating_avg', params.minRating);
  if (params.maxDuration !== undefined) query = query.lte('duration_minutes', params.maxDuration);
  if (params.language) query = query.contains('guide_locales', [params.language]);
  if (params.dayPart) query = query.contains('day_parts', [params.dayPart]);
  if (params.pickup) query = query.eq('pickup_included', true);
  if (params.instant) query = query.eq('confirmation', 'instant');
  if (params.private) query = query.eq('is_private', true);
  if (params.family) query = query.eq('family_friendly', true);
  if (params.luxury) query = query.eq('is_luxury', true);
  if (params.deals) query = query.gt('discount_pct', 0);

  query = applySort(query, params);

  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error('[search] query failed', error);
    return { results: [], total: 0, page: params.page, pageCount: 0, configured: true };
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const total = count ?? 0;

  return {
    configured: true,
    total,
    page: params.page,
    pageCount: Math.ceil(total / PAGE_SIZE),
    results: rows.map((row) => ({
      id: String(row.tour_id),
      slug: String(row.slug),
      title: String(row.title),
      summary: (row.summary as string) ?? null,
      cityName: String(row.city_name),
      countryName: String(row.country_name),
      companyName: String(row.company_name),
      durationMinutes: Number(row.duration_minutes),
      fromPrice: Number(row.from_price),
      currency: String(row.currency),
      discountPct: Number(row.discount_pct ?? 0),
      ratingAvg: Number(row.rating_avg ?? 0),
      ratingCount: Number(row.rating_count ?? 0),
      confirmation: String(row.confirmation),
      pickupIncluded: Boolean(row.pickup_included),
      coverUrl: (row.cover_url as string) ?? null,
      coverAlt: (row.cover_alt as string) ?? null,
      coverBlurhash: (row.cover_blurhash as string) ?? null,
      categoryNames: (row.category_names as string[]) ?? [],
    })),
  };
});

type Query = ReturnType<ReturnType<typeof getSupabasePublicClient>['from']>;

function applySort(query: any, params: SearchParams) {
  switch (params.sort) {
    case 'price_asc':    return query.order('from_price', { ascending: true });
    case 'price_desc':   return query.order('from_price', { ascending: false });
    case 'rating':       return query.order('rating_avg', { ascending: false })
                                     .order('rating_count', { ascending: false });
    case 'duration_asc': return query.order('duration_minutes', { ascending: true });
    case 'discount':     return query.order('discount_pct', { ascending: false });
    case 'newest':       return query.order('updated_at', { ascending: false });
    case 'popularity':   return query.order('popularity_score', { ascending: false });
    // "Recommended" is popularity weighted by rating confidence. A 5.0 from
    // two reviews should not outrank a 4.6 from four hundred, so rating_count
    // is a tiebreaker rather than rating alone.
    default:
      return query
        .order('popularity_score', { ascending: false })
        .order('rating_count', { ascending: false })
        .order('rating_avg', { ascending: false });
  }
}

/**
 * Facet counts for the filter sidebar, scoped to the current city.
 *
 * Counts ignore the visitor's *own* selections in that facet, which is why
 * this is a separate query: showing "Adventure (0)" next to a ticked
 * Adventure box is the classic faceted-search bug.
 */
export const getFacets = cache(async (locale: Locale, cityId?: string) => {
  if (!isDatabaseConfigured()) return { categories: [], priceRange: null, total: 0 };

  const supabase = getSupabasePublicClient();
  let query = supabase
    .from('tour_search_index')
    .select('category_names, from_price, pickup_included, confirmation')
    .eq('locale', locale);

  if (cityId) query = query.eq('city_id', cityId);

  const { data } = await query.limit(1000);
  const rows = (data ?? []) as unknown as Array<{
    category_names: string[]; from_price: string;
    pickup_included: boolean; confirmation: string;
  }>;

  const counts = new Map<string, number>();
  let min = Infinity;
  let max = 0;

  for (const row of rows) {
    for (const name of row.category_names ?? []) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const price = Number(row.from_price);
    if (price < min) min = price;
    if (price > max) max = price;
  }

  return {
    total: rows.length,
    categories: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    priceRange: rows.length ? { min: Math.floor(min), max: Math.ceil(max) } : null,
  };
});
