import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export const DIRECTORY_PAGE_SIZE = 24;

export type Vertical = {
  id: string; code: string; slug: string; name: string;
  fulfilment: 'booking' | 'enquiry' | 'affiliate' | 'info_only';
  intro: string | null; metaTitle: string | null; metaDescription: string | null;
};

export type DirectoryListing = {
  id: string; name: string; slug: string; summary: string | null;
  cityName: string; citySlug: string; countrySlug: string;
  verticalSlug: string; address: string | null;
  rating: number | null; ratingCount: number;
  priceLevel: number | null; priceFrom: number | null; currency: string | null;
  amenities: string[]; attributes: Record<string, unknown>;
  imageUrl: string | null; bookingUrl: string | null; website: string | null;
  isFeatured: boolean;
};

export type DirectoryFilters = {
  amenities: string[]; priceLevel: number | null; minRating: number | null;
  sort: 'recommended' | 'rating' | 'price_asc' | 'price_desc' | 'name';
  page: number;
};

export const getVerticals = cache(async (locale: Locale): Promise<Vertical[]> => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('verticals')
    .select('id, code, fulfilment, position, translations:vertical_translations!inner ( locale, name, slug, intro, meta_title, meta_description )')
    .eq('is_active', true)
    .eq('vertical_translations.locale', locale)
    .order('position');

  return ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => {
    const t = (row.translations ?? [])[0] ?? {};
    return {
      id: String(row.id), code: String(row.code),
      fulfilment: String(row.fulfilment) as Vertical['fulfilment'],
      slug: t.slug ?? String(row.code), name: t.name ?? String(row.code),
      intro: t.intro ?? null, metaTitle: t.meta_title ?? null,
      metaDescription: t.meta_description ?? null,
    };
  });
});

export const getVerticalBySlug = cache(async (slug: string, locale: Locale) => {
  const verticals = await getVerticals(locale);
  return verticals.find((v) => v.slug === slug) ?? null;
});

/**
 * Listings for one destination and vertical.
 *
 * Reads `directory_listings`, a security_invoker view that already flattens
 * the joins — so filtering is a set of predicates on one relation rather than
 * a join tree rebuilt per request.
 */
export const searchDirectory = cache(async (
  cityId: string,
  verticalId: string | null,
  filters: DirectoryFilters,
  locale: Locale,
): Promise<{ listings: DirectoryListing[]; total: number; pageCount: number }> => {
  if (!isDatabaseConfigured()) return { listings: [], total: 0, pageCount: 0 };

  const supabase = getSupabasePublicClient();
  const from = (filters.page - 1) * DIRECTORY_PAGE_SIZE;

  let query = supabase
    .from('directory_listings')
    .select('*', { count: 'exact' })
    .eq('locale', locale)
    .eq('city_id', cityId);

  if (verticalId) query = query.eq('vertical_id', verticalId);
  // `contains` maps to the array @> operator, which uses the GIN index.
  if (filters.amenities.length) query = query.contains('amenities', filters.amenities);
  if (filters.priceLevel) query = query.eq('price_level', filters.priceLevel);
  if (filters.minRating) query = query.gte('rating', filters.minRating);

  switch (filters.sort) {
    case 'rating':     query = query.order('rating', { ascending: false, nullsFirst: false }); break;
    case 'price_asc':  query = query.order('price_from', { ascending: true, nullsFirst: false }); break;
    case 'price_desc': query = query.order('price_from', { ascending: false, nullsFirst: false }); break;
    case 'name':       query = query.order('name', { ascending: true }); break;
    default:
      // Featured first is a paid placement, so it is limited to the top of
      // page one and never disguised as an organic ranking.
      query = query.order('is_featured', { ascending: false })
                   .order('popularity_score', { ascending: false })
                   .order('rating', { ascending: false, nullsFirst: false });
  }

  const { data, count, error } = await query.range(from, from + DIRECTORY_PAGE_SIZE - 1);
  if (error) {
    console.error('[directory] query failed', error);
    return { listings: [], total: 0, pageCount: 0 };
  }

  const total = count ?? 0;
  return {
    total,
    pageCount: Math.ceil(total / DIRECTORY_PAGE_SIZE),
    listings: ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
      id: String(row.id), name: String(row.name), slug: String(row.slug),
      summary: row.summary ?? null,
      cityName: String(row.city_name), citySlug: String(row.city_slug),
      countrySlug: String(row.country_slug), verticalSlug: String(row.vertical_slug ?? ''),
      address: row.address ?? null,
      rating: row.rating === null ? null : Number(row.rating),
      ratingCount: Number(row.rating_count ?? 0),
      priceLevel: row.price_level === null ? null : Number(row.price_level),
      priceFrom: row.price_from === null ? null : Number(row.price_from),
      currency: row.currency ?? null,
      amenities: (row.amenities ?? []) as string[],
      attributes: (row.attributes ?? {}) as Record<string, unknown>,
      imageUrl: row.image_url ?? null, bookingUrl: row.booking_url ?? null,
      website: row.website ?? null, isFeatured: Boolean(row.is_featured),
    })),
  };
});

/** Facet counts, computed in the database rather than by pulling every row. */
export const getDirectoryFacets = cache(async (
  cityId: string, verticalId: string | null, locale: Locale,
) => {
  if (!isDatabaseConfigured()) return { amenities: [], priceLevels: [], ratings: [] };

  const supabase = getSupabasePublicClient();
  const { data } = await supabase.rpc('directory_facets', {
    p_city_id: cityId, p_vertical_id: verticalId, p_locale: locale,
  });

  const rows = ((data ?? []) as unknown as Array<{ facet: string; value: string; count: number }>);
  return {
    amenities: rows.filter((r) => r.facet === 'amenity')
      .map((r) => ({ value: r.value, count: Number(r.count) })).slice(0, 18),
    priceLevels: rows.filter((r) => r.facet === 'price_level')
      .map((r) => ({ value: Number(r.value), count: Number(r.count) }))
      .sort((a, b) => a.value - b.value),
    ratings: rows.filter((r) => r.facet === 'rating' && r.value !== 'any')
      .map((r) => ({ value: Number(r.value), count: Number(r.count) }))
      .sort((a, b) => b.value - a.value),
  };
});
