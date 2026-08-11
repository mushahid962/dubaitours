import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Search, ArrowRight, BadgeCheck, ShieldCheck, Headphones, Wallet, Star, Database } from 'lucide-react';
import { getHomeData } from '@/services/homepage-repository';
import { getCategoryTree, getTopCities } from '@/services/taxonomy-repository';
import { buildMetadata } from '@/lib/seo/metadata';
import { routes } from '@/lib/seo/routes';
import { graph, itemListSchema } from '@/lib/seo/json-ld';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { JsonLd } from '@/components/seo/json-ld';
import { Section } from '@/components/home/section';
import { TourRail } from '@/components/home/tour-rail';
import { NewsletterForm } from '@/components/home/newsletter-form';

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  return buildMetadata({
    locale,
    title: 'Tours, tickets and experiences across the Gulf',
    description:
      'Book desert safaris, attraction tickets and day trips across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait. Verified operators, instant confirmation, free cancellation.',
    path: (candidate) => routes.home(candidate),
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const [data, categories, cities] = await Promise.all([
    getHomeData(locale),
    getCategoryTree(locale),
    getTopCities(locale),
  ]);
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  // Canonical directory URL. Declared once here so every link on the page
  // agrees, and so the short /{city}/{category} form can 301 into it.
  const dir = (citySlug: string, countrySlug: string, category?: string, sub?: string) =>
    `${prefix}/${countrySlug}/${citySlug}${category ? `/${category}` : ''}${sub ? `/${sub}` : ''}`;

  const featured = categories.filter((c) => c.isFeatured);
  const rest = categories.filter((c) => !c.isFeatured);
  const flagship = cities[0];

  return (
    <>
      {data.destinations.length > 0 && (
        <JsonLd id="home" data={graph(itemListSchema(
          data.destinations.map((d) => ({
            name: `Things to do in ${d.name}`,
            url: routes.thingsToDo(locale, d.countrySlug, d.slug),
          })),
        ))} />
      )}

      {!data.live && (
        <p className="flex flex-wrap items-center justify-center gap-2 bg-[var(--brass-wash)] px-4 py-2.5 text-center text-[var(--text-sm)] text-[var(--ink-soft)]">
          <Database className="h-4 w-4 text-[var(--brass)]" aria-hidden />
          Demo mode — connect Supabase to load real tours, prices and reviews.
        </p>
      )}

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pb-16 pt-20 text-center">
          <p className="rounded-[var(--radius-pill)] bg-[var(--teal-wash)] px-4 py-1.5 text-[var(--text-sm)] font-medium text-[var(--teal-deep)]">
            {data.stats.countryCount} countries · {data.stats.cityCount} cities · licensed operators only
          </p>

          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-4xl)] leading-[1.05] md:text-[var(--text-5xl)]">
            Every experience in the Gulf,
            <span className="text-[var(--teal)]"> bookable today</span>
          </h1>

          <p className="max-w-xl text-[var(--text-lg)] text-[var(--ink-soft)]">
            Desert safaris, attraction tickets, day trips and private guides across six countries —
            with free cancellation and instant confirmation.
          </p>

          <form action={routes.search(locale)} className="flex w-full max-w-xl gap-2">
            <label htmlFor="q" className="sr-only">Search experiences</label>
            <span className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-[var(--ink-faint)]" aria-hidden />
              <input
                id="q" name="q" type="search"
                placeholder="Try “desert safari Dubai” or “AlUla”"
                className="h-14 w-full rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] ps-12 pe-4 text-[var(--text-base)] shadow-[var(--shadow-card)]"
              />
            </span>
            <button type="submit" className="h-14 rounded-[var(--radius-pill)] bg-[var(--teal)] px-7 font-semibold text-white transition-colors hover:bg-[var(--teal-deep)]">
              Search
            </button>
          </form>

          {data.popularSearches.length > 0 && (
            <nav aria-label="Popular searches" className="flex flex-wrap justify-center gap-2">
              <span className="text-[var(--text-sm)] text-[var(--ink-faint)]">Popular:</span>
              {data.popularSearches.map((item) => (
                <Link key={item.label} href={item.href}
                  className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 py-1 text-[var(--text-sm)] hover:border-[var(--teal)] hover:text-[var(--teal)]">
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ categories */}
      <Section id="categories" title="What are you looking for?"
        subtitle="Every category, in every city we cover." tone="band">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {featured.map((category) => (
            <li key={category.id}>
              <Link
                href={flagship ? dir(flagship.slug, flagship.countrySlug, category.slug) : routes.search(locale)}
                className="dune-lift flex h-full flex-col justify-between gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                <span className="font-semibold">{category.name}</span>
                <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {/* Only shown where there is inventory. "0 listings" reads
                      as broken; silence reads as a category not yet filled. */}
                  {category.listingCount > 0
                    ? `${category.listingCount} in ${flagship?.name ?? 'the Gulf'}`
                    : 'Browse'}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {rest.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {rest.map((category) => (
              <li key={category.id}>
                <Link
                  href={flagship ? dir(flagship.slug, flagship.countrySlug, category.slug) : routes.search(locale)}
                  className="inline-block rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-1.5 text-[var(--text-sm)] hover:border-[var(--teal)] hover:text-[var(--teal)]">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --------------------------------------------------- popular activities */}
      {featured.some((c) => (c.children?.length ?? 0) > 0) && flagship && (
        <Section id="activities" title={`Popular in ${flagship.name}`}
          subtitle="The specific things people actually search for — not just the category above them."
          href={dir(flagship.slug, flagship.countrySlug, 'tours')} hrefLabel="All tours">
          <ul className="flex flex-wrap gap-2">
            {featured
              .flatMap((category) => (category.children ?? []).map((sub) => ({ category, sub })))
              .slice(0, 16)
              .map(({ category, sub }) => (
                <li key={sub.id}>
                  <Link href={dir(flagship.slug, flagship.countrySlug, category.slug, sub.slug)}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--paper)] px-4 py-2 text-[var(--text-sm)] shadow-[var(--shadow-card)] hover:text-[var(--teal)]">
                    {sub.name}
                    {sub.listingCount > 0 && (
                      <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{sub.listingCount}</span>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {/* -------------------------------------------------------------- trending */}
      {data.trending.length > 0 && (
        <Section
          id="trending" title="Booked most this week"
          subtitle="Ranked by real bookings over the last 30 days, not by who paid us."
          href={routes.search(locale)} hrefLabel="Browse all"
        >
          <TourRail tours={data.trending} locale={locale} priority />
        </Section>
      )}

      {/* ----------------------------------------------------------------- deals */}
      {data.deals.length > 0 && (
        <Section
          id="deals" title="On offer right now"
          subtitle="Operator-set discounts. When the offer ends, the price goes back up — we don't fake countdowns."
          tone="band"
        >
          <TourRail tours={data.deals} locale={locale} />
        </Section>
      )}

      {/* ---------------------------------------------------------- destinations */}
      <Section id="destinations" title="Where are you going?"
        subtitle="Six countries. Every category available in every city."
        href={`${prefix}/destinations`} hrefLabel="All destinations">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(cities.length ? cities : data.destinations.map((d) => ({
            id: d.slug, name: d.name, slug: d.slug, countrySlug: d.countrySlug,
            tagline: d.tagline, heroImageUrl: d.heroImageUrl, listingCount: d.tourCount,
          }))).map((city) => (
            <li key={city.id ?? city.slug}>
              <Link href={dir(city.slug, city.countrySlug)}
                className="dune-lift group relative flex h-56 flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
                {city.heroImageUrl && (
                  <>
                    <Image src={city.heroImageUrl} alt="" fill sizes="(max-width: 640px) 92vw, 23vw"
                      className="object-cover transition-transform duration-[600ms] ease-[var(--ease-out)] group-hover:scale-105" />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[rgb(11_31_28/0.82)] via-[rgb(11_31_28/0.2)] to-transparent" />
                  </>
                )}
                <span className={`relative flex flex-col gap-0.5 ${city.heroImageUrl ? 'text-white' : ''}`}>
                  <span className="text-[var(--text-xl)] font-semibold">{city.name}</span>
                  {city.tagline && (
                    <span className={`text-[var(--text-sm)] ${city.heroImageUrl ? 'text-white/85' : 'text-[var(--ink-soft)]'}`}>
                      {city.tagline}
                    </span>
                  )}
                  {city.listingCount > 0 && (
                    <span className={`pt-1 text-[var(--text-xs)] ${city.heroImageUrl ? 'text-white/70' : 'text-[var(--ink-faint)]'}`}>
                      {city.listingCount} listings
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ------------------------------------------------------------ top rated */}
      {data.topRated.length > 0 && (
        <Section
          id="top-rated" title="Highest rated"
          subtitle="Only experiences with at least five verified reviews appear here."
          tone="band"
        >
          <TourRail tours={data.topRated} locale={locale} />
        </Section>
      )}

      {/* --------------------------------------------------------- why book here */}
      <Section id="why" title="Why book through us">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: BadgeCheck, title: 'Licence-checked operators', body: 'We read every trade licence by hand before an operator can list. That is the whole reason the reviews mean anything.' },
            { icon: ShieldCheck, title: 'Free cancellation', body: 'Most experiences refund in full up to 48 hours before. The exact policy is on every tour page before you pay.' },
            { icon: Wallet, title: 'Pay in your currency', body: 'Prices in AED, SAR, QAR, OMR, BHD and KWD, VAT included. No conversion surprises at checkout.' },
            { icon: Headphones, title: 'Support in four languages', body: 'English, Arabic, Hindi and Urdu — from people who know the destinations.' },
          ].map((item) => (
            <li key={item.title} className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
              <item.icon className="h-6 w-6 text-[var(--teal)]" aria-hidden />
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{item.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* -------------------------------------------------------------- operators */}
      {data.operators.length > 0 && (
        <Section id="operators" title="Operators travellers rate" tone="band">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.operators.map((operator) => (
              <li key={operator.slug}>
                <Link href={routes.company(locale, operator.slug)}
                  className="dune-lift flex h-full items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                  {operator.logoUrl ? (
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-md)]">
                      <Image src={operator.logoUrl} alt="" fill sizes="48px" className="object-cover" />
                    </span>
                  ) : (
                    <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--teal-wash)] font-semibold text-[var(--teal-deep)]">
                      {operator.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {operator.name}
                      {operator.verification !== 'none' && (
                        <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--brass)]" aria-label="Licence verified" />
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-[var(--text-xs)] text-[var(--ink-faint)]">
                      {operator.ratingCount > 0 ? (
                        <>
                          <Star className="h-3 w-3 fill-[var(--brass)] text-[var(--brass)]" aria-hidden />
                          {operator.ratingAvg.toFixed(1)} · {operator.ratingCount} reviews
                        </>
                      ) : 'New operator'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------------------------------------------------------------- partner */}
      <Section id="partner" title="Run tours in the Gulf?"
        subtitle="Free to list. We take a commission only when you get a booking, and you're paid weekly.">
        <div className="flex flex-wrap items-center gap-4">
          <Link href={`${prefix}/partner/apply`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--ink)] px-6 py-3 text-[var(--text-sm)] font-semibold text-[var(--salt)]">
            Apply to list your business <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
          {data.stats.operatorCount > 0 && (
            <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
              {data.stats.operatorCount} operators already listed.
            </p>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------- newsletter */}
      <section aria-labelledby="newsletter" className="bg-[var(--ink)] py-14 text-[var(--salt)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="newsletter" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              New experiences, once a month
            </h2>
            <p className="max-w-md text-[var(--text-sm)] text-[var(--salt)]/70">
              What's just opened across the Gulf, what's worth booking early, and the odd honest
              warning about what isn't.
            </p>
          </div>
          <NewsletterForm locale={locale} />
        </div>
      </section>
    </>
  );
}
