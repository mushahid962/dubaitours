import type { Metadata } from 'next';
import { DEFAULT_LOCALE, dirFor, type Locale } from '@/lib/i18n/config';
import { SITE_URL, absolute, buildAlternates } from './routes';

const SITE_NAME = 'TravelHub Gulf';

type BuildMetadataInput = {
  locale: Locale;
  title: string;
  description: string;
  /** Path for this page in each locale; return null where no translation exists. */
  path: (locale: Locale) => string | null;
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
  type?: 'website' | 'article' | 'product';
  robots?: { index: boolean; follow: boolean };
  publishedTime?: string;
  modifiedTime?: string;
  authorName?: string;
  keywords?: string[];
};

/**
 * Every indexable page routes its metadata through here, so title format,
 * hreflang, canonicals and social cards can never drift apart.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { canonical, languages } = buildAlternates(input.path);
  const currentPath = input.path(input.locale) ?? '/';
  const url = absolute(currentPath);

  const image = input.image ?? {
    url: `${SITE_URL}/og/default.jpg`,
    width: 1200,
    height: 630,
    alt: SITE_NAME,
  };

  return {
    metadataBase: new URL(SITE_URL),
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: { canonical: input.locale === DEFAULT_LOCALE ? canonical : url, languages },
    robots: {
      index: input.robots?.index ?? true,
      follow: input.robots?.follow ?? true,
      googleBot: {
        index: input.robots?.index ?? true,
        follow: input.robots?.follow ?? true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: input.type === 'product' ? 'website' : input.type ?? 'website',
      siteName: SITE_NAME,
      locale: input.locale,
      url,
      title: input.title,
      description: input.description,
      images: [image],
      ...(input.type === 'article' && {
        publishedTime: input.publishedTime,
        modifiedTime: input.modifiedTime,
        authors: input.authorName ? [input.authorName] : undefined,
      }),
    },
    twitter: {
      card: 'summary_large_image',
      site: '@travelhubgulf',
      title: input.title,
      description: input.description,
      images: [image.url],
    },
    other: { 'content-language': input.locale, 'text-direction': dirFor(input.locale) },
  };
}

/** Titles are capped so Google shows the value proposition, not an ellipsis. */
export function composeTitle(parts: string[], max = 60) {
  const base = parts.filter(Boolean).join(' | ');
  return base.length <= max ? base : `${base.slice(0, max - 1).trimEnd()}…`;
}

export function truncateDescription(text: string, max = 155) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
