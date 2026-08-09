import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type LocationLevel = 'country' | 'region' | 'city' | 'district' | 'neighborhood' | 'poi';

export type LocationPage = {
  id: string; level: LocationLevel; parentId: string | null; depth: number;
  name: string; slug: string; h1: string | null; tagline: string | null;
  intro: string | null; description: string | null; body: string | null;
  metaTitle: string | null; metaDescription: string | null;
  canonicalUrl: string | null; robots: string;
  countryCode: string; timezone: string;
  latitude: number | null; longitude: number | null;
  heroImageUrl: string | null; listingCount: number; childCount: number;
  shouldIndex: boolean;
  cityId: string | null; countryId: string | null; regionId: string | null;
};

export type Crumb = { id: string; level: LocationLevel; name: string; slug: string; depth: number };

const mapRow = (row: Record<string, any>): LocationPage => ({
  id: String(row.id), level: String(row.level) as LocationLevel,
  parentId: row.parent_id ?? null, depth: Number(row.depth ?? 0),
  name: String(row.name), slug: String(row.slug),
  h1: row.h1 ?? null, tagline: row.tagline ?? null, intro: row.intro ?? null,
  description: row.description ?? null, body: row.body ?? null,
  metaTitle: row.meta_title ?? null, metaDescription: row.meta_description ?? null,
  canonicalUrl: row.canonical_url ?? null, robots: String(row.robots ?? 'index,follow'),
  countryCode: String(row.country_code), timezone: String(row.timezone ?? 'Asia/Dubai'),
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
  heroImageUrl: row.hero_image_url ?? null,
  listingCount: Number(row.listing_count ?? 0), childCount: Number(row.child_count ?? 0),
  shouldIndex: Boolean(row.should_index),
  cityId: row.city_id ?? null, countryId: row.country_id ?? null, regionId: row.region_id ?? null,
});

/**
 * Resolves /destinations/{slug} at any level.
 *
 * Slugs are globally unique per locale, so the URL does not have to encode
 * the hierarchy — which is what lets /destinations/dubai-marina work without
 * /destinations/uae/dubai-emirate/dubai/ in front of it.
 */
export const getLocationBySlug = cache(async (
  slug: string, locale: Locale,
): Promise<LocationPage | null> => {
  if (!isDatabaseConfigured()) return null;

  const supabase = getSupabasePublicClient();
  const { data, error } = await supabase
    .from('location_pages').select('*').eq('locale', locale).eq('slug', slug).maybeSingle();

  // A query failure is an outage, not a missing page. Returning null here
  // would 404 the whole destination tree during a blip and cost the index.
  if (error) throw new Error(`Location lookup failed: ${error.message}`);
  if (!data) return null;
  return mapRow(data as unknown as Record<string, any>);
});

/** Ancestors, root first — the breadcrumb trail, in one query. */
export const getAncestors = cache(async (locationId: string, locale: Locale): Promise<Crumb[]> => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase.rpc('location_ancestors', {
    p_location_id: locationId, p_locale: locale,
  });
  return ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id), level: String(row.level) as LocationLevel,
    name: String(row.name), slug: String(row.slug), depth: Number(row.depth),
  }));
});

export const getChildren = cache(async (
  locationId: string, locale: Locale, level?: LocationLevel,
) => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase.rpc('location_descendants', {
    p_location_id: locationId, p_level: level ?? null, p_locale: locale,
  });
  return ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id), level: String(row.level) as LocationLevel,
    name: String(row.name), slug: String(row.slug),
    listingCount: Number(row.listing_count ?? 0),
  }));
});

/** Direct children only — what a destination page lists beneath itself. */
export const getDirectChildren = cache(async (locationId: string, locale: Locale) => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('location_pages').select('*')
    .eq('locale', locale).eq('parent_id', locationId)
    .order('display_order', { ascending: false })
    .order('listing_count', { ascending: false });
  return ((data ?? []) as unknown as Array<Record<string, any>>).map(mapRow);
});

export const getCountries = cache(async (locale: Locale) => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('location_pages').select('*')
    .eq('locale', locale).eq('level', 'country')
    .order('display_order', { ascending: false });
  return ((data ?? []) as unknown as Array<Record<string, any>>).map(mapRow);
});

/**
 * Slugs for the sitemap — only pages that pass the indexation gate.
 * This is the single control that stops a six-level hierarchy across six
 * countries from generating a sitemap full of empty pages.
 */
export const getIndexableSlugs = cache(async (locale: Locale) => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('location_pages').select('slug, level, listing_count')
    .eq('locale', locale).eq('should_index', true);
  return ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    slug: String(row.slug), level: String(row.level) as LocationLevel,
  }));
});
