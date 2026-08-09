import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MapPin, ArrowRight } from 'lucide-react';
import { getCountries, getChildren } from '@/services/location-repository';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { JsonLd } from '@/components/seo/json-ld';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return buildMetadata({
    locale,
    title: 'Destinations across the Gulf',
    description: 'Every country, city and neighbourhood we cover across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait.',
    path: (candidate) => `${candidate === DEFAULT_LOCALE ? '' : `/${candidate}`}/destinations`,
  });
}

export default async function DestinationsIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const base = `${prefix}/destinations`;

  const countries = await getCountries(locale);
  const cityLists = await Promise.all(
    countries.map(async (country) => ({
      country,
      cities: (await getChildren(country.id, locale, 'city')).slice(0, 8),
    })),
  );

  return (
    <>
      <JsonLd id="destinations" data={graph(
        breadcrumbSchema([{ name: 'Destinations', path: base }]),
        itemListSchema(countries.map((c) => ({ name: c.name, url: `${base}/${c.slug}` }))),
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-4xl)]">Destinations</h1>
          <p className="max-w-2xl text-[var(--text-lg)] text-[var(--ink-soft)]">
            Six countries, {countries.reduce((t, c) => t + c.childCount, 0)} regions and every city,
            district and neighbourhood beneath them.
          </p>
        </header>

        {cityLists.map(({ country, cities }) => (
          <section key={country.id} aria-labelledby={`c-${country.id}`} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`c-${country.id}`} className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                <Link href={`${base}/${country.slug}`} className="hover:text-[var(--teal)]">
                  {country.name}
                </Link>
              </h2>
              <Link href={`${base}/${country.slug}`}
                className="inline-flex items-center gap-1 text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
                All of {country.name} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>

            {cities.length === 0 ? (
              <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">No cities live yet.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cities.map((city) => (
                  <li key={city.id}>
                    <Link href={`${base}/${city.slug}`}
                      className="dune-lift flex h-full flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <MapPin className="h-4 w-4 text-[var(--teal)]" aria-hidden /> {city.name}
                      </span>
                      {/* Counts only where there is something to count — "0
                          experiences" reads as broken rather than as honest. */}
                      {city.listingCount > 0 && (
                        <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                          {city.listingCount} {city.listingCount === 1 ? 'experience' : 'experiences'}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
