import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type BusinessCategory = {
  id: string; code: string; name: string; slug: string; plural: string | null;
  h1: string | null; intro: string | null; body: string | null; icon: string | null;
  kind: 'business' | 'activity' | 'place';
  parentId: string | null; isFeatured: boolean;
  metaTitle: string | null; metaDescription: string | null;
  listingCount: number; minPrice: number | null; currency: string | null;
  children?: BusinessCategory[];
};

const mapRow = (row: Record<string, any>, counts?: Map<string, any>): BusinessCategory => {
  const t = (row.translations ?? [])[0] ?? {};
  const count = counts?.get(String(row.id));
  return {
    id: String(row.id), code: String(row.code),
    name: t.name ?? String(row.code), slug: t.slug ?? String(row.code),
    plural: t.plural ?? null, h1: t.h1 ?? null, intro: t.intro ?? null,
    body: t.body ?? null,
    icon: row.icon ?? null, kind: (row.kind ?? 'business') as BusinessCategory['kind'],
    parentId: row.parent_id ?? null, isFeatured: Boolean(row.is_featured),
    metaTitle: t.meta_title ?? null, metaDescription: t.meta_description ?? null,
    listingCount: Number(count?.listing_count ?? 0),
    minPrice: count?.min_price === null || count?.min_price === undefined ? null : Number(count.min_price),
    currency: count?.currency ?? null,
  };
};

/**
 * The full category tree, optionally with counts for one city.
 *
 * Counts come from `city_category_counts`, a table refreshed by a job rather
 * than computed per request — the navigation shows a number beside every one
 * of ~35 categories, and counting them live would be 35 scans per page view.
 */
export const getCategoryTree = cache(async (
  locale: Locale, cityId?: string,
): Promise<BusinessCategory[]> => {
  if (!isDatabaseConfigured()) return [];

  const supabase = getSupabasePublicClient();
  const [{ data: rows }, { data: countRows }] = await Promise.all([
    supabase.from('business_categories')
      .select('id, code, parent_id, icon, kind, is_featured, display_order, translations:business_category_translations!inner ( locale, name, slug, plural, h1, intro, body, meta_title, meta_description )')
      .eq('is_active', true)
      .eq('business_category_translations.locale', locale)
      .order('display_order', { ascending: false }),
    cityId
      ? supabase.from('city_category_counts')
          .select('category_id, listing_count, min_price, currency').eq('city_id', cityId)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const counts = new Map(
    ((countRows ?? []) as unknown as Array<Record<string, any>>)
      .map((r) => [String(r.category_id), r]),
  );

  const all = ((rows ?? []) as unknown as Array<Record<string, any>>).map((r) => mapRow(r, counts));
  const byParent = new Map<string, BusinessCategory[]>();
  for (const category of all) {
    if (!category.parentId) continue;
    byParent.set(category.parentId, [...(byParent.get(category.parentId) ?? []), category]);
  }

  return all
    .filter((category) => !category.parentId)
    .map((category) => ({ ...category, children: byParent.get(category.id) ?? [] }));
});

export const getCategoryBySlugPath = cache(async (
  locale: Locale, categorySlug: string, subSlug?: string,
) => {
  const tree = await getCategoryTree(locale);
  const category = tree.find((c) => c.slug === categorySlug);
  if (!category) return null;
  if (!subSlug) return { category, sub: null };
  const sub = category.children?.find((c) => c.slug === subSlug) ?? null;
  if (!sub) return null;
  return { category, sub };
});

/**
 * Resolves a directory URL in one round trip. Keeping the rules in the
 * database means the router, the sitemap and the breadcrumbs cannot disagree
 * about what a path means.
 */
export const resolveDirectoryPath = cache(async (
  country: string, city: string, locale: Locale, category?: string, sub?: string,
) => {
  if (!isDatabaseConfigured()) return null;
  const supabase = getSupabasePublicClient();
  const { data } = await supabase.rpc('resolve_directory_path', {
    p_country: country, p_city: city,
    p_category: category ?? null, p_sub: sub ?? null, p_locale: locale,
  });
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, any> | null;
  if (!row?.city_id) return null;

  return {
    cityId: String(row.city_id), cityName: String(row.city_name),
    countryId: String(row.country_id), countryName: String(row.country_name),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: row.category_name ?? null,
    categoryKind: row.category_kind ?? null,
    subId: row.sub_id ? String(row.sub_id) : null,
    subName: row.sub_name ?? null,
    listingCount: Number(row.listing_count ?? 0),
  };
});

/** Cities with the most inventory — the homepage location grid. */
export const getTopCities = cache(async (locale: Locale, limit = 12) => {
  if (!isDatabaseConfigured()) return [];
  const supabase = getSupabasePublicClient();
  const { data } = await supabase
    .from('city_translations')
    .select('name, slug, tagline, city:cities!inner ( id, priority, hero_image_url, is_featured, country:countries!inner ( translations:country_translations ( locale, slug ) ) )')
    .eq('locale', locale).limit(40);

  const { data: totals } = await supabase
    .from('city_category_counts').select('city_id, listing_count');

  const byCity = new Map<string, number>();
  for (const row of ((totals ?? []) as unknown as Array<Record<string, any>>)) {
    byCity.set(String(row.city_id), (byCity.get(String(row.city_id)) ?? 0) + Number(row.listing_count));
  }

  return ((data ?? []) as unknown as Array<Record<string, any>>)
    .map((row) => ({
      id: String(row.city?.id),
      name: String(row.name), slug: String(row.slug),
      tagline: row.tagline ?? null,
      heroImageUrl: row.city?.hero_image_url ?? null,
      countrySlug: (row.city?.country?.translations ?? [])
        .find((t: any) => t.locale === locale)?.slug ?? '',
      priority: Number(row.city?.priority ?? 0),
      listingCount: byCity.get(String(row.city?.id)) ?? 0,
    }))
    .filter((city) => city.countrySlug)
    .sort((a, b) => b.listingCount - a.listingCount || b.priority - a.priority)
    .slice(0, limit);
});
