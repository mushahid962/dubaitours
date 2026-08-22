import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { graph, organizationSchema, websiteSchema } from '@/lib/seo/json-ld';
import { LOCALES, dirFor, isLocale, type Locale } from '@/lib/i18n/config';
import { SITE_URL } from '@/lib/seo/routes';
import '../globals.css';

/**
 * Fonts are loaded with a stylesheet link rather than next/font.
 *
 * next/font downloads the files at build time, which is slightly faster for
 * visitors — but it makes the build depend on fonts.googleapis.com being
 * reachable. On a corporate network, an air-gapped CI runner or a flaky
 * connection, that turns a font into a failed deployment.
 *
 * `preconnect` recovers most of the difference, and `display=swap` means text
 * is readable immediately in the fallback face while the webfont loads.
 *
 * To switch to next/font later: import the four families from
 * 'next/font/google', drop this constant and the <link> tags, and set the
 * --font-*-loaded variables from each font's `.variable`.
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2'
  + '?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700'
  + '&family=Be+Vietnam+Pro:wght@400;500;600;700'
  + '&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700'
  + '&family=Noto+Sans+Devanagari:wght@400;500;600;700'
  + '&display=swap';

/** Only the four launch locales are pre-rendered; the rest 404 until shipped. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EFF2F1' },
    { media: '(prefers-color-scheme: dark)', color: '#08120F' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'TravelHub Gulf — tours, tickets and experiences across the GCC',
    template: '%s | TourLeads',
  },
  description:
    'Book tours, attraction tickets and desert experiences across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait. Verified operators, instant confirmation, free cancellation.',
  applicationName: 'TourLeads',
  formatDetection: { telephone: false },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;
  const dir = dirFor(typed);
  // The proxy sets this so the header's language switcher can keep the
  // visitor on the page they're already reading.
  const path = (await headers()).get('x-thg-pathname') ?? '/';

  return (
    <html
      lang={typed}
      dir={dir}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body>
        {/* Site-wide entities, emitted once. Page-level nodes add to this graph
            rather than repeating Organization on every URL. */}
        <JsonLd data={graph(organizationSchema(), websiteSchema(typed))} id="site" />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--paper)] focus:px-4 focus:py-2 focus:shadow-[var(--shadow-lift)]"
        >
          Skip to content
        </a>

        <SiteHeader locale={typed} path={path} />
        <main id="main">{children}</main>
        <SiteFooter locale={typed} />
      </body>
    </html>
  );
}
