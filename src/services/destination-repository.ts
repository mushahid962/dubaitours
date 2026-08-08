import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type CityPage = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  body: string | null;
  bestTimeToVisit: string | null;
  gettingAround: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  heroImageUrl: string | null;
  timezone: string;
  lat: number;
  lng: number;
  country: { id: string; name: string; slug: string; iso2: string; currency: string };
};

/** Resolves a country/city slug pair. Both must match, so a mismatched pair
 *  404s instead of silently rendering the right city under the wrong country
 *  — which would create two indexable URLs for one page. */
export const getCityBySlug = cache(async (
  countrySlug: string,
  citySlug: string,
  locale: Locale,
): Promise<CityPage | null> => {
  if (!isDatabaseConfigured()) return null;

  const supabase = getSupabasePublicClient();

  const { data, error } = await supabase
    .from('city_translations')
    .select(`
      name, slug, tagline, intro, body, best_time_to_visit, getting_around,
      meta_title, meta_description,
      city:cities!inner (
        id, timezone, centroid, hero_image_url,
        country:countries!inner (
          id, iso2, currency,
          translations:country_translations!inner ( name, slug, locale )
        )
      )
    `)
    .eq('slug', citySlug)
    .eq('locale', locale)
    .eq('city.country.translations.locale', locale)
    .eq('city.country.translations.slug', countrySlug)
    .maybeSingle();

  // A query error means the database is unreachable or misconfigured — not
  // that this city is gone. Throwing produces a 500, which crawlers retry.
  // Returning null here would 404 the entire catalogue during an outage.
  if (error) throw new Error(`City lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as {
    name: string; slug: string; tagline: string | null; intro: string | null; body: string | null;
    best_time_to_visit: string | null; getting_around: string | null;
    meta_title: string | null; meta_description: string | null;
    city: {
      id: string; timezone: string; centroid: unknown; hero_image_url: string | null;
      country: { id: string; iso2: string; currency: string; translations: Array<{ name: string; slug: string }> };
    };
  };

  const country = row.city.country;

  return {
    id: row.city.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    intro: row.intro,
    body: row.body,
    bestTimeToVisit: row.best_time_to_visit,
    gettingAround: row.getting_around,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    heroImageUrl: row.city.hero_image_url,
    timezone: row.city.timezone,
    lat: 0,
    lng: 0,
    country: {
      id: country.id,
      iso2: country.iso2,
      currency: country.currency,
      name: country.translations[0]?.name ?? '',
      slug: country.translations[0]?.slug ?? '',
    },
  };
});

/** Every city translated in this locale — used for hreflang on city pages. */
export const getCitySlugsByLocale = cache(async (cityId: string) => {
  if (!isDatabaseConfigured()) return new Map<Locale, { city: string; country: string }>();

  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('city_translations')
    .select('locale, slug, city:cities!inner ( country:countries!inner ( translations:country_translations ( locale, slug ) ) )')
    .eq('city_id', cityId);

  const map = new Map<Locale, { city: string; country: string }>();
  for (const row of (data ?? []) as unknown as Array<{
    locale: string; slug: string;
    city: { country: { translations: Array<{ locale: string; slug: string }> } };
  }>) {
    const countrySlug = row.city.country.translations.find((t) => t.locale === row.locale)?.slug;
    if (countrySlug) map.set(row.locale as Locale, { city: row.slug, country: countrySlug });
  }
  return map;
});

/** Category by slug, for the /uae/dubai/desert-safari facet pages. */
export const getCategoryBySlug = cache(async (slug: string, locale: Locale) => {
  if (!isDatabaseConfigured()) return null;

  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('category_translations')
    .select('category_id, name, slug, intro, body, meta_title, meta_description')
    .eq('slug', slug)
    .eq('locale', locale)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    category_id: string; name: string; slug: string; intro: string | null;
    body: string | null; meta_title: string | null; meta_description: string | null;
  };
  return { id: row.category_id, name: row.name, slug: row.slug, intro: row.intro,
           body: row.body, metaTitle: row.meta_title, metaDescription: row.meta_description };
});
