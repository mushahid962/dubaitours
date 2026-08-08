import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { breadcrumbSchema, graph, itemListSchema } from '@/lib/seo/json-ld';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; country: string }> };

type CountryPageData = {
  countryId: string;
  name: string;
  metaTitle: string | null;
  metaDescription: string | null;
  intro: string | null;
  body: string | null;
  cities: Array<{ name: string; slug: string; tagline: string | null; priority: number }>;
};

async function loadCountry(slug: string, locale: Locale): Promise<CountryPageData | null> {
  if (!isDatabaseConfigured()) return null;
  const supabase = getSupabasePublicClient();

  const { data, error } = await supabase
    .from('country_translations')
    .select('country_id, name, slug, tagline, intro, body, meta_title, meta_description')
    .eq('slug', slug).eq('locale', locale).maybeSingle();

  // Distinguish "no such country" from "database unreachable". The first is a
  // 404; the second must be a 500 so crawlers retry instead of deindexing.
  if (error) throw new Error(`Country lookup failed: ${error.message}`);
  if (!data) return null;
  const country = data as unknown as Record<string, any>;

  const { data: cityRows } = await supabase
    .from('city_translations')
    .select('name, slug, tagline, city:cities!inner ( id, country_id, hero_image_url, priority )')
    .eq('locale', locale)
    .eq('cities.country_id', country.country_id);

  const cities = ((cityRows ?? []) as unknown as Array<Record<string, any>>)
    .map((row) => ({
      name: row.name as string,
      slug: row.slug as string,
      tagline: (row.tagline as string) ?? null,
      priority: Number(row.city?.priority ?? 0),
    }))
    .sort((a, b) => b.priority - a.priority);

  return {
    countryId: String(country.country_id),
    name: String(country.name),
    metaTitle: country.meta_title ?? null,
    metaDescription: country.meta_description ?? null,
    intro: country.intro ?? null,
    body: country.body ?? null,
    cities,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, country } = await params;
  if (!isLocale(locale)) return {};

  const data = await loadCountry(country, locale);
  if (!data) return { robots: { index: false, follow: false } };

  return buildMetadata({
    locale,
    title: data.metaTitle ?? composeTitle([`Things to Do in ${data.name}`, `${new Date().getFullYear()} Tours & Tickets`]),
    description: data.metaDescription
      ?? truncateDescription(data.intro ?? `Book tours and experiences across ${data.name}.`),
    path: (candidate) => (candidate === locale ? routes.country(candidate, country) : null),
  });
}

export default async function CountryPage({ params }: Props) {
  const { locale: raw, country } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const data = await loadCountry(country, locale);
  if (!data) {
    if (!isDatabaseConfigured()) return <NotConfigured slug={country} />;
    notFound();
  }

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: data.name, path: routes.country(locale, country) },
  ];

  return (
    <>
      <JsonLd id="country" data={graph(
        breadcrumbSchema(trail),
        itemListSchema(data.cities.map((city) => ({
          name: `Things to do in ${city.name}`,
          url: routes.thingsToDo(locale, country, city.slug),
        }))),
      )} />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-4xl)]">
            Things to do in {data.name}
          </h1>
          {data.intro && (
            <p className="max-w-2xl text-[var(--text-lg)] leading-relaxed text-[var(--ink-soft)]">{data.intro}</p>
          )}
        </header>

        <section aria-labelledby="cities" className="flex flex-col gap-4">
          <h2 id="cities" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
            Where to go
          </h2>
          {data.cities.length === 0 ? (
            <p className="text-[var(--ink-soft)]">No cities are live in {data.name} yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.cities.map((city) => (
                <li key={city.slug}>
                  <Link href={routes.thingsToDo(locale, country, city.slug)}
                    className="dune-lift flex h-full flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
                    <span className="text-[var(--text-xl)] font-semibold">{city.name}</span>
                    {city.tagline && <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">{city.tagline}</span>}
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[var(--text-sm)] font-medium text-[var(--teal)]">
                      Things to do <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.body && (
          <section className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-8">
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              Visiting {data.name}
            </h2>
            <p className="max-w-3xl whitespace-pre-line leading-relaxed text-[var(--ink-soft)]">{data.body}</p>
          </section>
        )}
      </div>
    </>
  );
}

function NotConfigured({ slug }: { slug: string }) {
  const name = slug.split('-').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Things to do in {name}</h1>
      <p className="text-[var(--ink-soft)]">
        Connect Supabase and run the seed file to fill this page — Part 3 of the setup guide.
      </p>
      <Link href="/" className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
        Back to home
      </Link>
    </div>
  );
}
