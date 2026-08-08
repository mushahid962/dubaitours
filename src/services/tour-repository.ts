import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { cached, cacheKeys } from '@/lib/cache/redis';
import type { Locale } from '@/lib/i18n/config';

/**
 * Everything the tour page renders, in one shape.
 *
 * Two layers of caching sit under this: React `cache` dedupes calls inside a
 * single render (metadata and the page body both need the tour, and that must
 * be one query), and Redis holds the result across requests until a supplier
 * edit invalidates the tag.
 */
export type TourPageData = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  knowBeforeYouGo: string | null;
  meetingInstructions: string | null;
  metaTitle: string | null;
  metaDescription: string | null;

  durationMinutes: number;
  minAge: number | null;
  maxPax: number | null;
  tourType: string;
  confirmation: 'instant' | 'manual' | 'on_request';
  cancellationHours: number | null;
  pickupIncluded: boolean;
  familyFriendly: boolean;
  guideLocales: string[];

  fromPrice: number;
  compareAtPrice: number | null;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
  publishedAt: string | null;
  updatedAt: string;

  city: { id: string; name: string; slug: string; timezone: string; lat: number; lng: number };
  country: { id: string; name: string; slug: string; iso2: string };
  category: { id: string; name: string; slug: string };
  company: { id: string; slug: string; name: string; logoUrl: string | null; verification: string; ratingAvg: number };

  media: Array<{ url: string; alt: string; width: number | null; height: number | null; blurhash: string | null }>;
  itinerary: Array<{ position: number; title: string; description: string | null; durationMinutes: number | null }>;
  faqs: Array<{ question: string; answer: string }>;
  meetingPoint: { lat: number; lng: number } | null;
};

/** Policy enum → the number of hours we actually show the traveller. */
const CANCELLATION_HOURS: Record<string, number | null> = {
  flexible_24h: 24,
  moderate_48h: 48,
  standard_72h: 72,
  strict: 168,
  non_refundable: null,
};

export const getTourBySlug = cache(
  async (slug: string, locale: Locale): Promise<TourPageData | null> =>
    cached(cacheKeys.tour(slug, locale), { ttl: 3600, tags: [`tour:${slug}`] }, () =>
      loadTour(slug, locale),
    ),
);

async function loadTour(slug: string, locale: Locale): Promise<TourPageData | null> {
  if (!isDatabaseConfigured()) return null;
  const supabase = getSupabasePublicClient();

  const { data: translation } = await supabase
    .from('tour_translations')
    .select('*')
    .eq('slug', slug)
    .eq('locale', locale)
    .maybeSingle();

  if (!translation) return null;

  const { data: tour } = await supabase
    .from('tours')
    .select(`
      id, status, tour_type, confirmation, cancellation, duration_minutes, min_age, max_pax,
      pickup_included, family_friendly, guide_locales, base_currency, from_price,
      compare_at_price, rating_avg, rating_count, published_at, updated_at,
      meeting_point_lat:meeting_point, primary_category_id,
      city:cities!inner (
        id, timezone, centroid,
        translations:city_translations!inner ( name, slug, locale ),
        country:countries!inner (
          id, iso2,
          translations:country_translations!inner ( name, slug, locale )
        )
      ),
      company:companies!inner ( id, slug, display_name, logo_url, verification, rating_avg ),
      category:categories!inner (
        id,
        translations:category_translations!inner ( name, slug, locale )
      )
    `)
    .eq('id', translation.tour_id)
    .eq('status', 'published')
    .eq('city.translations.locale', locale)
    .eq('city.country.translations.locale', locale)
    .eq('category.translations.locale', locale)
    .maybeSingle();

  if (!tour) return null;

  const [{ data: media }, { data: itinerary }, { data: faqs }] = await Promise.all([
    supabase
      .from('tour_media')
      .select('position, is_cover, alt_text, media:media_assets!inner ( url, width, height, blurhash )')
      .eq('tour_id', tour.id)
      .order('is_cover', { ascending: false })
      .order('position'),
    supabase
      .from('tour_itinerary')
      .select('position, duration_minutes, translations:tour_itinerary_translations!inner ( title, description, locale )')
      .eq('tour_id', tour.id)
      .eq('translations.locale', locale)
      .order('position'),
    supabase
      .from('tour_faqs')
      .select('position, translations:tour_faq_translations!inner ( question, answer, locale )')
      .eq('tour_id', tour.id)
      .eq('is_published', true)
      .eq('translations.locale', locale)
      .order('position'),
  ]);

  const city = tour.city as never as {
    id: string; timezone: string; centroid: string;
    translations: Array<{ name: string; slug: string }>;
    country: { id: string; iso2: string; translations: Array<{ name: string; slug: string }> };
  };
  const category = tour.category as never as { id: string; translations: Array<{ name: string; slug: string }> };
  const company = tour.company as never as {
    id: string; slug: string; display_name: string; logo_url: string | null;
    verification: string; rating_avg: number;
  };

  const centroid = parsePoint(city.centroid);
  const meeting = parsePoint((tour as { meeting_point_lat?: string }).meeting_point_lat);

  return {
    id: tour.id,
    slug,
    title: translation.title,
    summary: translation.summary,
    description: translation.description,
    highlights: translation.highlights ?? [],
    inclusions: translation.inclusions ?? [],
    exclusions: translation.exclusions ?? [],
    whatToBring: translation.what_to_bring ?? [],
    knowBeforeYouGo: translation.know_before_you_go,
    meetingInstructions: translation.meeting_instructions,
    metaTitle: translation.meta_title,
    metaDescription: translation.meta_description,

    durationMinutes: tour.duration_minutes,
    minAge: tour.min_age,
    maxPax: tour.max_pax,
    tourType: tour.tour_type,
    confirmation: tour.confirmation,
    cancellationHours: CANCELLATION_HOURS[tour.cancellation] ?? null,
    pickupIncluded: tour.pickup_included,
    familyFriendly: tour.family_friendly,
    guideLocales: tour.guide_locales ?? [],

    fromPrice: Number(tour.from_price),
    compareAtPrice: tour.compare_at_price === null ? null : Number(tour.compare_at_price),
    currency: tour.base_currency,
    ratingAvg: Number(tour.rating_avg),
    ratingCount: tour.rating_count,
    publishedAt: tour.published_at,
    updatedAt: tour.updated_at,

    city: {
      id: city.id,
      name: city.translations[0]?.name ?? '',
      slug: city.translations[0]?.slug ?? '',
      timezone: city.timezone,
      lat: centroid?.lat ?? 0,
      lng: centroid?.lng ?? 0,
    },
    country: {
      id: city.country.id,
      iso2: city.country.iso2,
      name: city.country.translations[0]?.name ?? '',
      slug: city.country.translations[0]?.slug ?? '',
    },
    category: {
      id: category.id,
      name: category.translations[0]?.name ?? '',
      slug: category.translations[0]?.slug ?? '',
    },
    company: {
      id: company.id,
      slug: company.slug,
      name: company.display_name,
      logoUrl: company.logo_url,
      verification: company.verification,
      ratingAvg: Number(company.rating_avg),
    },

    media: (media ?? []).map((row) => {
      const asset = row.media as never as { url: string; width: number | null; height: number | null; blurhash: string | null };
      const alt = (row.alt_text as Record<string, string>)?.[locale];
      return {
        url: asset.url,
        // A missing alt is an accessibility and image-SEO failure, so fall
        // back to a description built from data rather than an empty string.
        alt: alt ?? `${translation.title} — ${city.translations[0]?.name ?? ''}`,
        width: asset.width,
        height: asset.height,
        blurhash: asset.blurhash,
      };
    }),

    itinerary: (itinerary ?? []).map((row) => {
      const t = (row.translations as never as Array<{ title: string; description: string | null }>)[0];
      return {
        position: row.position,
        title: t?.title ?? '',
        description: t?.description ?? null,
        durationMinutes: row.duration_minutes,
      };
    }),

    faqs: (faqs ?? []).map((row) => {
      const t = (row.translations as never as Array<{ question: string; answer: string }>)[0];
      return { question: t?.question ?? '', answer: t?.answer ?? '' };
    }).filter((f) => f.question && f.answer),

    meetingPoint: meeting,
  };
}

/**
 * Slugs for every locale this tour is translated into. The page needs these
 * to build hreflang, and it must not guess: an untranslated locale gets no
 * alternate link rather than a link to a 404.
 */
export const getTourSlugsByLocale = cache(async (tourId: string) => {
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('tour_translations')
    .select('locale, slug')
    .eq('tour_id', tourId);

  return new Map((data ?? []).map((row) => [row.locale as Locale, row.slug]));
});

/** Shape the related-tours rail renders. Mapping here rather than in the page
 *  keeps every raw column name inside the repository. */
export type RelatedTour = {
  id: string; slug: string; title: string; summary: string | null; cityName: string;
  durationMinutes: number; fromPrice: number; currency: string;
  ratingAvg: number; ratingCount: number; confirmation: string; pickupIncluded: boolean;
  coverUrl: string | null; coverAlt: string | null; coverBlurhash: string | null;
};

/**
 * Related tours: same city, same category, excluding the current tour,
 * ranked by the popularity score the nightly job maintains.
 */
export const getRelatedTours = cache(async (tour: TourPageData, locale: Locale, limit = 8) => {
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('tour_search_index')
    .select('tour_id, title, slug, summary, city_name, duration_minutes, from_price, currency, rating_avg, rating_count, confirmation, pickup_included, cover_url, cover_alt, cover_blurhash, discount_pct')
    .eq('locale', locale)
    .eq('city_id', tour.city.id)
    .contains('category_ids', [tour.category.id])
    .neq('tour_id', tour.id)
    .order('popularity_score', { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row): RelatedTour => ({
    id: String(row.tour_id),
    slug: String(row.slug),
    title: String(row.title),
    summary: (row.summary as string) ?? null,
    cityName: String(row.city_name),
    durationMinutes: Number(row.duration_minutes),
    fromPrice: Number(row.from_price),
    currency: String(row.currency),
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    confirmation: String(row.confirmation),
    pickupIncluded: Boolean(row.pickup_included),
    coverUrl: (row.cover_url as string) ?? null,
    coverAlt: (row.cover_alt as string) ?? null,
    coverBlurhash: (row.cover_blurhash as string) ?? null,
  }));
});

/** Attractions, restaurants and hotels near the meeting point. */
export const getNearbyPlaces = cache(async (tour: TourPageData, locale: Locale) => {
  const supabase = getSupabasePublicClient();
  const origin = tour.meetingPoint ?? { lat: tour.city.lat, lng: tour.city.lng };

  const { data } = await supabase
    .from('points_of_interest')
    .select('id, kind, image_url, rating, translations:poi_translations!inner ( name, slug, summary, locale )')
    .eq('city_id', tour.city.id)
    .eq('is_active', true)
    .eq('translations.locale', locale)
    .limit(12);

  return (data ?? []).map((row) => {
    const t = (row.translations as never as Array<{ name: string; slug: string; summary: string | null }>)[0];
    return { id: row.id, kind: row.kind, name: t?.name ?? '', slug: t?.slug ?? '', summary: t?.summary ?? null, imageUrl: row.image_url, rating: row.rating, origin };
  });
});

/** WKB/WKT hex from PostGIS arrives as a string; GeoJSON arrives as an object. */
function parsePoint(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;
  if (typeof value === 'object' && 'coordinates' in (value as object)) {
    const [lng, lat] = (value as { coordinates: [number, number] }).coordinates;
    return { lat, lng };
  }
  return null;
}
