import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { cached } from '@/lib/cache/redis';
import type { Locale } from '@/lib/i18n/config';
import type { SearchResult } from '@/services/search-repository';

export type HomeDestination = {
  name: string; slug: string; countrySlug: string; tagline: string | null;
  heroImageUrl: string | null; tourCount: number;
};

export type HomeCategory = { name: string; slug: string; icon: string | null; tourCount: number };

export type HomeOperator = {
  name: string; slug: string; logoUrl: string | null;
  verification: string; ratingAvg: number; ratingCount: number; tourCount: number;
};

export type HomeStats = {
  tourCount: number; operatorCount: number; cityCount: number;
  countryCount: number; reviewCount: number; ratingAvg: number;
};

export type HomeData = {
  live: boolean;
  stats: HomeStats;
  destinations: HomeDestination[];
  categories: HomeCategory[];
  trending: SearchResult[];
  deals: SearchResult[];
  topRated: SearchResult[];
  operators: HomeOperator[];
  popularSearches: Array<{ label: string; href: string }>;
};

/**
 * Everything the homepage renders, assembled once.
 *
 * Cached for 15 minutes in Redis on top of the page's own ISR window: the
 * homepage is the single hottest URL on the site, and it must never be the
 * reason the database gets busy.
 */
export const getHomeData = cache(async (locale: Locale): Promise<HomeData> => {
  if (!isDatabaseConfigured()) return demoData();

  try {
    return await cached(`home:${locale}`, { ttl: 900, tags: ['home'] }, () => loadHomeData(locale));
  } catch (error) {
    // The homepage must render even if a rail fails. Showing demo content is
    // wrong here — better to render what we have than to 500 the front door.
    console.error('[home] load failed, falling back', error);
    return { ...demoData(), live: false };
  }
});

async function loadHomeData(locale: Locale): Promise<HomeData> {
  const supabase = getSupabasePublicClient();

  const [statsRes, citiesRes, categoriesRes, indexRes, operatorsRes, searchesRes] = await Promise.all([
    supabase.from('homepage_stats').select('*').maybeSingle(),
    supabase.from('city_translations')
      .select('name, slug, tagline, city:cities!inner ( id, priority, is_featured, hero_image_url, country:countries!inner ( translations:country_translations ( locale, slug ) ) )')
      .eq('locale', locale).limit(12),
    supabase.from('category_translations')
      .select('name, slug, category:categories!inner ( id, icon, priority, is_featured )')
      .eq('locale', locale).limit(14),
    // One read of the search index feeds trending, deals and top-rated —
    // three rails, one query, sliced in memory.
    supabase.from('tour_search_index').select('*').eq('locale', locale)
      .order('popularity_score', { ascending: false }).limit(60),
    supabase.from('companies')
      .select('slug, display_name, logo_url, verification, rating_avg, rating_count')
      .eq('status', 'active').order('rating_avg', { ascending: false }).limit(8),
    supabase.from('popular_searches').select('label, href')
      .eq('locale', locale).eq('is_active', true).order('position').limit(8),
  ]);

  const statsRow = (statsRes.data ?? {}) as unknown as Record<string, any>;
  const indexed = ((indexRes.data ?? []) as unknown as Array<Record<string, any>>).map(toResult);

  const toursByCity = new Map<string, number>();
  const toursByCategory = new Map<string, number>();
  for (const row of (indexRes.data ?? []) as unknown as Array<Record<string, any>>) {
    toursByCity.set(String(row.city_id), (toursByCity.get(String(row.city_id)) ?? 0) + 1);
    for (const name of (row.category_names ?? []) as string[]) {
      toursByCategory.set(name, (toursByCategory.get(name) ?? 0) + 1);
    }
  }

  const destinations = ((citiesRes.data ?? []) as unknown as Array<Record<string, any>>)
    .map((row) => ({
      name: String(row.name),
      slug: String(row.slug),
      countrySlug: (row.city?.country?.translations ?? [])
        .find((t: any) => t.locale === locale)?.slug ?? '',
      tagline: row.tagline ?? null,
      heroImageUrl: row.city?.hero_image_url ?? null,
      tourCount: toursByCity.get(String(row.city?.id)) ?? 0,
      priority: Number(row.city?.priority ?? 0),
    }))
    .filter((city) => city.countrySlug)
    .sort((a, b) => b.tourCount - a.tourCount || b.priority - a.priority)
    .slice(0, 8);

  const categories = ((categoriesRes.data ?? []) as unknown as Array<Record<string, any>>)
    .map((row) => ({
      name: String(row.name),
      slug: String(row.slug),
      icon: row.category?.icon ?? null,
      tourCount: toursByCategory.get(String(row.name)) ?? 0,
      priority: Number(row.category?.priority ?? 0),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  const operatorCounts = new Map<string, number>();
  for (const row of (indexRes.data ?? []) as unknown as Array<Record<string, any>>) {
    operatorCounts.set(String(row.company_name), (operatorCounts.get(String(row.company_name)) ?? 0) + 1);
  }

  return {
    live: true,
    stats: {
      tourCount: Number(statsRow.tour_count ?? 0),
      operatorCount: Number(statsRow.operator_count ?? 0),
      cityCount: Number(statsRow.city_count ?? 0),
      countryCount: Number(statsRow.country_count ?? 0),
      reviewCount: Number(statsRow.review_count ?? 0),
      ratingAvg: Number(statsRow.rating_avg ?? 0),
    },
    destinations,
    categories,
    trending: indexed.slice(0, 8),
    deals: indexed.filter((t) => t.discountPct >= 10)
      .sort((a, b) => b.discountPct - a.discountPct).slice(0, 8),
    // "Top rated" needs a review floor. A single 5-star review outranking a
    // 4.7 from three hundred is how a top-rated rail loses all meaning.
    topRated: indexed.filter((t) => t.ratingCount >= 5 && t.ratingAvg >= 4.5)
      .sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount)
      .slice(0, 8),
    operators: ((operatorsRes.data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
      name: String(row.display_name),
      slug: String(row.slug),
      logoUrl: row.logo_url ?? null,
      verification: String(row.verification),
      ratingAvg: Number(row.rating_avg ?? 0),
      ratingCount: Number(row.rating_count ?? 0),
      tourCount: operatorCounts.get(String(row.display_name)) ?? 0,
    })),
    popularSearches: ((searchesRes.data ?? []) as unknown as Array<Record<string, any>>)
      .map((row) => ({ label: String(row.label), href: String(row.href) })),
  };
}

function toResult(row: Record<string, any>): SearchResult {
  return {
    id: String(row.tour_id), slug: String(row.slug), title: String(row.title),
    summary: row.summary ?? null, cityName: String(row.city_name),
    countryName: String(row.country_name), companyName: String(row.company_name),
    durationMinutes: Number(row.duration_minutes), fromPrice: Number(row.from_price),
    currency: String(row.currency), discountPct: Number(row.discount_pct ?? 0),
    ratingAvg: Number(row.rating_avg ?? 0), ratingCount: Number(row.rating_count ?? 0),
    confirmation: String(row.confirmation), pickupIncluded: Boolean(row.pickup_included),
    coverUrl: row.cover_url ?? null, coverAlt: row.cover_alt ?? null,
    coverBlurhash: row.cover_blurhash ?? null, categoryNames: row.category_names ?? [],
  };
}

/**
 * Shown before a database is connected. Real destination names and real
 * taglines, but zero counts and no tours — so the page looks like the product
 * without inventing inventory that does not exist.
 */
function demoData(): HomeData {
  return {
    live: false,
    stats: { tourCount: 0, operatorCount: 0, cityCount: 10, countryCount: 6, reviewCount: 0, ratingAvg: 0 },
    destinations: [
      { name: 'Dubai', slug: 'dubai', countrySlug: 'united-arab-emirates', tagline: 'Superlatives, served daily', heroImageUrl: null, tourCount: 0 },
      { name: 'Abu Dhabi', slug: 'abu-dhabi', countrySlug: 'united-arab-emirates', tagline: 'Culture, coastline and Ferrari-fast thrills', heroImageUrl: null, tourCount: 0 },
      { name: 'Riyadh', slug: 'riyadh', countrySlug: 'saudi-arabia', tagline: 'A capital rewriting itself', heroImageUrl: null, tourCount: 0 },
      { name: 'AlUla', slug: 'alula', countrySlug: 'saudi-arabia', tagline: 'Nabataean tombs in an open-air gallery', heroImageUrl: null, tourCount: 0 },
      { name: 'Doha', slug: 'doha', countrySlug: 'qatar', tagline: 'Souqs, sand and serious museums', heroImageUrl: null, tourCount: 0 },
      { name: 'Muscat', slug: 'muscat', countrySlug: 'oman', tagline: 'Forts above, wadis behind', heroImageUrl: null, tourCount: 0 },
      { name: 'Manama', slug: 'manama', countrySlug: 'bahrain', tagline: 'Small island, dense history', heroImageUrl: null, tourCount: 0 },
      { name: 'Kuwait City', slug: 'kuwait-city', countrySlug: 'kuwait', tagline: 'Towers, dhows and desert edges', heroImageUrl: null, tourCount: 0 },
    ],
    categories: [
      { name: 'Desert Safari', slug: 'desert-safari', icon: 'sun', tourCount: 0 },
      { name: 'Adventure', slug: 'adventure', icon: 'mountain', tourCount: 0 },
      { name: 'Water & Cruises', slug: 'water-cruises', icon: 'waves', tourCount: 0 },
      { name: 'Attractions & Tickets', slug: 'attractions-tickets', icon: 'ticket', tourCount: 0 },
      { name: 'Culture & Heritage', slug: 'culture-heritage', icon: 'landmark', tourCount: 0 },
      { name: 'Luxury', slug: 'luxury', icon: 'gem', tourCount: 0 },
      { name: 'Dune Buggy & Quad', slug: 'dune-buggy-quad', icon: 'car-front', tourCount: 0 },
      { name: 'Transfers', slug: 'airport-transfers', icon: 'car', tourCount: 0 },
    ],
    trending: [], deals: [], topRated: [], operators: [],
    popularSearches: [
      { label: 'Desert safari Dubai', href: '/search?q=desert+safari' },
      { label: 'Burj Khalifa tickets', href: '/search?q=Burj+Khalifa' },
      { label: 'AlUla tours', href: '/search?q=AlUla' },
      { label: 'Doha dhow cruise', href: '/search?q=dhow+cruise' },
    ],
  };
}
