import Link from 'next/link';
import Image from 'next/image';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, Clock } from 'lucide-react';
import {
  getLocationBySlug, getAncestors, getDirectChildren, getIndexableSlugs,
} from '@/services/location-repository';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { absolute, routes } from '@/lib/seo/routes';
import { breadcrumbSchema, faqSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';

// Not statically generated. The shared layout reads request headers (the
// site header needs the current path for its language switcher), and a page
// marked for static generation that touches headers throws
// DYNAMIC_SERVER_USAGE at request time — a 500 on every destination page.
//
// The trade is real: no build-time HTML. It is bought back with a CDN cache
// on the response, which is where a directory page's caching belongs anyway
// since listing counts change through the day.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; path: string[] }> };

/**
 * Pre-renders only what passes the indexation gate.
 *
 * The brief was explicit: do not generate millions of pages. A six-level
 * hierarchy across six countries is combinatorially large, and pre-rendering
 * it would mean a build that takes an hour to produce pages nobody asked for.
 * Everything else renders on first request and is cached from then on.
 */
// Kept for the sitemap and for warming: the set of destinations that pass the
// indexation gate. The brief was explicit that a six-level hierarchy across
// six countries must not generate millions of pages, and this is the list
// that decides which ones exist as far as Google is concerned.
export async function getPrerenderableSlugs() {
  if (!isDatabaseConfigured()) return [];
  try {
    return await getIndexableSlugs(DEFAULT_LOCALE);
  } catch (cause) {
    console.warn('[build] destination list unavailable:', cause);
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, path } = await params;
  if (!isLocale(locale)) return {};

  const slug = path[path.length - 1];
  const location = await getLocationBySlug(slug, locale);
  if (!location) return { robots: { index: false, follow: false } };

  const year = new Date().getFullYear();

  return buildMetadata({
    locale,
    title: location.metaTitle ?? composeTitle([`Things to Do in ${location.name}`, String(year)]),
    description: location.metaDescription
      ?? truncateDescription(location.intro ?? `A guide to ${location.name}.`),
    path: (candidate) =>
      `${candidate === DEFAULT_LOCALE ? '' : `/${candidate}`}/destinations/${slug}`,
    image: location.heroImageUrl ? { url: location.heroImageUrl, alt: location.name } : null,
    // The admin's robots value can force noindex, but it can never force
    // INDEX on a page the gate has judged thin.
    robots: {
      index: location.shouldIndex && !location.robots.includes('noindex'),
      follow: !location.robots.includes('nofollow'),
    },
  });
}

export default async function DestinationPage({ params }: Props) {
  const { locale: raw, path } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const base = `${prefix}/destinations`;

  if (!isDatabaseConfigured()) notFound();

  const slug = path[path.length - 1];
  const location = await getLocationBySlug(slug, locale);
  if (!location) notFound();

  // Slugs are globally unique, so /destinations/dubai/marina and
  // /destinations/marina are the same page. Consolidate onto the short form
  // rather than letting two URLs accumulate separate signals.
  if (path.length > 1) permanentRedirect(`${base}/${slug}`);

  const [ancestors, children] = await Promise.all([
    getAncestors(location.id, locale),
    getDirectChildren(location.id, locale),
  ]);

  const trail = [
    { name: 'Destinations', path: base },
    ...ancestors.map((crumb) => ({ name: crumb.name, path: `${base}/${crumb.slug}` })),
  ];

  const childLevelLabel = {
    country: 'Regions', region: 'Cities', city: 'Areas and districts',
    district: 'Neighbourhoods', neighborhood: 'Places', poi: 'Nearby',
  }[location.level];

  const faqs = location.listingCount > 0 ? [{
    question: `What is there to do in ${location.name}?`,
    answer: `${location.listingCount} bookable ${location.listingCount === 1 ? 'experience is' : 'experiences are'} listed in ${location.name}${
      children.length ? `, across ${children.length} ${children.length === 1 ? 'area' : 'areas'}` : ''}.`,
  }] : [];

  return (
    <>
      <JsonLd id="destination" data={graph(
        breadcrumbSchema(trail),
        faqSchema(faqs),
        {
          '@type': 'Place',
          name: location.name,
          description: location.intro ?? undefined,
          ...(location.latitude && location.longitude ? {
            geo: { '@type': 'GeoCoordinates', latitude: location.latitude, longitude: location.longitude },
          } : {}),
          address: { '@type': 'PostalAddress', addressCountry: location.countryCode },
        },
        children.length > 0
          ? itemListSchema(children.map((c) => ({ name: c.name, url: `${base}/${c.slug}` })))
          : null,
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] md:text-[var(--text-4xl)]">
            {location.h1 ?? `Things to Do in ${location.name}`}
          </h1>
          {location.tagline && (
            <p className="text-[var(--text-lg)] text-[var(--ink-soft)]">{location.tagline}</p>
          )}
          <p className="flex flex-wrap items-center gap-4 text-[var(--text-sm)] text-[var(--ink-faint)]">
            <span className="capitalize">{location.level.replace('_', ' ')}</span>
            {location.listingCount > 0 && <span>{location.listingCount} experiences</span>}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden /> {location.timezone}
            </span>
          </p>
        </header>

        {location.heroImageUrl && (
          <div className="relative aspect-[21/9] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--limestone)]">
            <Image src={location.heroImageUrl} alt={location.name} fill priority
              sizes="(max-width: 1024px) 100vw, 72rem" className="object-cover" />
          </div>
        )}

        {location.intro && (
          <p className="max-w-3xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">
            {location.intro}
          </p>
        )}

        {location.listingCount > 0 && location.cityId && (
          <Link href={routes.thingsToDo(locale, ancestors[0]?.slug ?? '', location.slug)}
            className="w-fit rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 py-3 text-[var(--text-sm)] font-semibold text-white">
            Browse {location.listingCount} experiences in {location.name}
          </Link>
        )}

        {children.length > 0 && (
          <section aria-labelledby="children" className="flex flex-col gap-4">
            <h2 id="children" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              {childLevelLabel} in {location.name}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {children.map((child) => (
                <li key={child.id}>
                  <Link href={`${base}/${child.slug}`}
                    className="dune-lift flex h-full flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <MapPin className="h-4 w-4 text-[var(--teal)]" aria-hidden /> {child.name}
                    </span>
                    {child.tagline && (
                      <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">{child.tagline}</span>
                    )}
                    {child.listingCount > 0 && (
                      <span className="mt-auto pt-2 text-[var(--text-xs)] text-[var(--ink-faint)]">
                        {child.listingCount} experiences
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {location.body && (
          <section className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-8">
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              About {location.name}
            </h2>
            <p className="max-w-3xl whitespace-pre-line leading-relaxed text-[var(--ink-soft)]">
              {location.body}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
