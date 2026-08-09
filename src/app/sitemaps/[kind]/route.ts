import { NextResponse } from 'next/server';
import { getSupabasePublicClient } from '@/lib/supabase/server';
import { cached, cacheKeys } from '@/lib/cache/redis';
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { SITE_URL, absolute, routes } from '@/lib/seo/routes';

export const revalidate = 3600;

type UrlEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  alternates?: Array<{ hreflang: string; href: string }>;
  images?: Array<{ loc: string; title?: string }>;
};

/**
 * Chunked sitemaps. Google caps a sitemap at 50,000 URLs / 50 MB, and a
 * marketplace crosses that quickly once every city × category is generated,
 * so each kind is paginated: /sitemaps/tours.xml?page=2
 */
const PAGE_SIZE = 20_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
  const name = kind.replace(/\.xml$/, '');

  const entries = await cached(
    cacheKeys.sitemapChunk(name, page),
    { ttl: 3600, tags: ['sitemap'] },
    () => buildEntries(name, page),
  );

  if (!entries) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(renderXml(entries, name === 'images'), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}

async function buildEntries(kind: string, page: number): Promise<UrlEntry[] | null> {
  const supabase = getSupabasePublicClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  if (kind === 'tours') {
    const { data } = await supabase
      .from('tour_translations')
      .select('slug, locale, tour:tours!inner(updated_at, status)')
      .eq('tours.status', 'published')
      .range(from, to);

    return (data ?? []).map((row) => ({
      loc: absolute(routes.tour(row.locale as Locale, row.slug)),
      lastmod: (row.tour as unknown as { updated_at: string }).updated_at,
      changefreq: 'daily',
      priority: 0.9,
      alternates: LOCALES.map((locale) => ({
        hreflang: locale,
        href: absolute(routes.tour(locale, row.slug)),
      })),
    }));
  }

  if (kind === 'destinations') {
    const [{ data: cities }, { data: countries }] = await Promise.all([
      supabase.from('city_translations').select('slug, locale, city:cities!inner(updated_at, country_id)'),
      supabase.from('country_translations').select('slug, locale, country_id'),
    ]);

    const countrySlugByLocale = new Map(
      (countries ?? []).map((c) => [`${c.country_id}:${c.locale}`, c.slug]),
    );

    const entries: UrlEntry[] = [];

    for (const country of countries ?? []) {
      entries.push({
        loc: absolute(routes.country(country.locale as Locale, country.slug)),
        changefreq: 'weekly',
        priority: 0.8,
      });
    }

    for (const city of cities ?? []) {
      const countryId = (city.city as unknown as { country_id: string }).country_id;
      const countrySlug = countrySlugByLocale.get(`${countryId}:${city.locale}`)
        ?? countrySlugByLocale.get(`${countryId}:${DEFAULT_LOCALE}`);
      if (!countrySlug) continue;

      const locale = city.locale as Locale;
      entries.push(
        { loc: absolute(routes.city(locale, countrySlug, city.slug)), changefreq: 'daily', priority: 0.9 },
        { loc: absolute(routes.thingsToDo(locale, countrySlug, city.slug)), changefreq: 'daily', priority: 1.0 },
      );
    }

    return entries.slice(from, to + 1);
  }

  if (kind === 'destinations') {
    // should_index is computed in the database, so the sitemap and the page's
    // own robots tag can never disagree — the classic way a sitemap ends up
    // advertising noindex pages.
    const { data } = await supabase
      .from('location_pages')
      .select('slug, locale, level, listing_count')
      .eq('should_index', true)
      .range(from, to);

    return (data ?? []).map((row) => ({
      loc: absolute(`${row.locale === DEFAULT_LOCALE ? '' : `/${row.locale}`}/destinations/${row.slug}`),
      changefreq: row.level === 'country' ? 'weekly' : 'daily',
      priority: row.level === 'city' ? 0.9 : row.level === 'country' ? 0.8 : 0.6,
    }));
  }

  if (kind === 'blog') {
    const { data } = await supabase
      .from('blog_post_translations')
      .select('slug, locale, post:blog_posts!inner(updated_at, published_at, status)')
      .eq('blog_posts.status', 'published')
      .range(from, to);

    return (data ?? []).map((row) => ({
      loc: absolute(routes.blogPost(row.locale as Locale, row.slug)),
      lastmod: (row.post as unknown as { updated_at: string }).updated_at,
      changefreq: 'weekly',
      priority: 0.7,
    }));
  }

  if (kind === 'images') {
    const { data } = await supabase
      .from('tour_media')
      .select('alt_text, media:media_assets!inner(url), tour:tours!inner(id, status)')
      .eq('tours.status', 'published')
      .range(from, to);

    const { data: slugs } = await supabase
      .from('tour_translations')
      .select('tour_id, slug')
      .eq('locale', DEFAULT_LOCALE);

    const slugById = new Map((slugs ?? []).map((s) => [s.tour_id, s.slug]));

    const grouped = new Map<string, UrlEntry>();
    for (const row of data ?? []) {
      const tourId = (row.tour as unknown as { id: string }).id;
      const slug = slugById.get(tourId);
      if (!slug) continue;
      const loc = absolute(routes.tour(DEFAULT_LOCALE, slug));
      const entry: UrlEntry = grouped.get(loc) ?? { loc, images: [] };
      entry.images!.push({
        loc: (row.media as unknown as { url: string }).url,
        title: (row.alt_text as Record<string, string>)?.[DEFAULT_LOCALE],
      });
      grouped.set(loc, entry);
    }
    return [...grouped.values()];
  }

  return null;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderXml(entries: UrlEntry[], withImages: boolean) {
  const body = entries
    .map((entry) => {
      const alternates = (entry.alternates ?? [])
        .map((alt) => `<xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${escape(alt.href)}"/>`)
        .join('');
      const images = (entry.images ?? [])
        .map((img) => `<image:image><image:loc>${escape(img.loc)}</image:loc>${img.title ? `<image:title>${escape(img.title)}</image:title>` : ''}</image:image>`)
        .join('');

      return [
        '<url>',
        `<loc>${escape(entry.loc)}</loc>`,
        entry.lastmod ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : '',
        entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : '',
        entry.priority ? `<priority>${entry.priority.toFixed(1)}</priority>` : '',
        alternates,
        images,
        '</url>',
      ].join('');
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"${withImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>${body}</urlset>`;
}
