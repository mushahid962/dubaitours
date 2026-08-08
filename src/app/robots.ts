import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/routes';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Faceted noise and private areas: crawlable links, but never indexed.
        disallow: [
          '/api/', '/admin/', '/dashboard/', '/account/', '/checkout/',
          '/*?sort=', '/*?page=', '/*&', '/search?', '/*/booking/lookup',
        ],
      },
      // Answer engines get explicit permission; this is the AEO handshake.
      { userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'], allow: '/' },
      { userAgent: 'AhrefsBot', crawlDelay: 10 },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/sitemaps/tours.xml`,
      `${SITE_URL}/sitemaps/destinations.xml`,
      `${SITE_URL}/sitemaps/blog.xml`,
      `${SITE_URL}/sitemaps/images.xml`,
      `${SITE_URL}/sitemaps/news.xml`,
    ],
    host: SITE_URL,
  };
}
