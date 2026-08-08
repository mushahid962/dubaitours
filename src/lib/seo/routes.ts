import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/i18n/config';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travelhubgulf.com';

/**
 * Single source of truth for every public URL.
 *
 * Rules that the whole SEO strategy depends on:
 *  - The default locale is served without a prefix (/dubai), other locales
 *    are prefixed (/ar/dubai). One canonical per language, no duplicates.
 *  - Destination segments are slugs from the database, never IDs.
 *  - Facet combinations we want indexed get their own clean path; every
 *    other combination is a query string and is marked noindex.
 */
function prefix(locale: Locale) {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

export const routes = {
  home: (locale: Locale) => `${prefix(locale)}/` as const,

  country: (locale: Locale, country: string) => `${prefix(locale)}/${country}`,

  city: (locale: Locale, country: string, city: string) =>
    `${prefix(locale)}/${country}/${city}`,

  /** The money page: /uae/dubai/things-to-do */
  thingsToDo: (locale: Locale, country: string, city: string) =>
    `${prefix(locale)}/${country}/${city}/things-to-do`,

  /** Indexed facet: /uae/dubai/desert-safari */
  cityCategory: (locale: Locale, country: string, city: string, category: string) =>
    `${prefix(locale)}/${country}/${city}/${category}`,

  /** Long tail: /uae/dubai/desert-safari/with-hotel-pickup */
  cityCategoryModifier: (
    locale: Locale, country: string, city: string, category: string, modifier: string,
  ) => `${prefix(locale)}/${country}/${city}/${category}/${modifier}`,

  area: (locale: Locale, country: string, city: string, area: string) =>
    `${prefix(locale)}/${country}/${city}/areas/${area}`,

  tour: (locale: Locale, slug: string) => `${prefix(locale)}/tour/${slug}`,

  attraction: (locale: Locale, country: string, city: string, poi: string) =>
    `${prefix(locale)}/${country}/${city}/attractions/${poi}`,

  company: (locale: Locale, slug: string) => `${prefix(locale)}/operator/${slug}`,

  search: (locale: Locale) => `${prefix(locale)}/search`,

  blogIndex: (locale: Locale) => `${prefix(locale)}/travel-guide`,
  blogPost: (locale: Locale, slug: string) => `${prefix(locale)}/travel-guide/${slug}`,
  author: (locale: Locale, slug: string) => `${prefix(locale)}/authors/${slug}`,

  checkout: (locale: Locale, reference: string) => `${prefix(locale)}/checkout/${reference}`,
  bookingLookup: (locale: Locale) => `${prefix(locale)}/booking/lookup`,
} as const;

export const absolute = (path: string) => new URL(path, SITE_URL).toString();

/**
 * Facet values that earn their own indexable URL. Anything outside this
 * list stays a query parameter, which keeps crawl budget on pages that
 * actually have demand behind them.
 */
export const INDEXABLE_MODIFIERS = new Set([
  'with-hotel-pickup', 'private', 'half-day', 'full-day', 'morning', 'evening',
  'family-friendly', 'luxury', 'cheap', 'free-cancellation', 'instant-confirmation',
]);

export function isIndexableFacetPath(segments: string[]) {
  return segments.every((segment) => INDEXABLE_MODIFIERS.has(segment)) && segments.length <= 1;
}

/**
 * Builds the hreflang cluster for a page. Each entry points at the same
 * content in another language, and x-default points at the English URL.
 */
export function buildAlternates(
  build: (locale: Locale) => string | null,
): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};

  for (const locale of LOCALES) {
    const path = build(locale);
    if (path) languages[locale] = absolute(path);
  }

  const canonicalPath = build(DEFAULT_LOCALE);
  languages['x-default'] = absolute(canonicalPath ?? '/');

  return { canonical: languages[DEFAULT_LOCALE] ?? absolute('/'), languages };
}
