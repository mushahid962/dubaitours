import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabasePublicClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { getNearbyPlaces, getRelatedTours, getTourBySlug, getTourSlugsByLocale } from '@/services/tour-repository';
import { getAvailability, lowestAvailablePrice, nextAvailableDate } from '@/services/availability';
import { getReviewSummary, getTourReviews } from '@/services/review-repository';
import { buildMetadata, composeTitle, truncateDescription } from '@/lib/seo/metadata';
import { absolute, routes } from '@/lib/seo/routes';
import { breadcrumbSchema, faqSchema, graph, reviewSchema, tourSchema } from '@/lib/seo/json-ld';
import { generatedQuestions, tourAnswerSummary } from '@/lib/seo/answer-engine';
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '@/lib/i18n/config';
import { formatDuration, formatMoney } from '@/lib/format';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumbs, type Crumb } from '@/components/seo/breadcrumbs';
import { Gallery } from '@/components/tours/gallery';
import { AnswerSummary } from '@/components/tours/answer-summary';
import { FaqAccordion } from '@/components/tours/faq-accordion';
import { BookingWidget } from '@/components/tours/booking-widget';
import { TourCard } from '@/components/tours/tour-card';
import { ReviewSection } from '@/components/reviews/review-section';

/**
 * ISR with a one-hour window. Supplier edits don't wait for it — publishing a
 * tour calls `revalidateTag('tour:{slug}')`, so the hour is only a backstop
 * for anything that changes outside the app (a direct database fix, a batch
 * import). Availability is fetched live inside the page and is not cached.
 */
export const revalidate = 3600;
export const dynamicParams = true;

type Params = { locale: string; slug: string };

/**
 * Pre-render the tours that carry the traffic, not all of them. Building
 * 40,000 pages at deploy time costs a 40-minute build to serve a long tail
 * that gets a handful of visits a month; those render on first request and
 * are cached from then on.
 */
export async function generateStaticParams() {
  // No database yet? Pre-render nothing. `dynamicParams` is true, so pages
  // still render on first request once Supabase is connected — the build
  // simply doesn't try to enumerate them.
  if (!isDatabaseConfigured()) return [];

  // This runs during `next build`. A throw here fails the entire deployment,
  // so a database that is reachable but not yet migrated — the normal state
  // between connecting Supabase and running the SQL — must degrade to "pre-
  // render nothing" rather than taking the build down. `dynamicParams` is
  // true, so pages still render on first request afterwards.
  try {
    const supabase = getSupabasePublicClient();
    const { data, error } = await supabase
      .from('tour_search_index')
      .select('slug, locale')
      .order('popularity_score', { ascending: false })
      .limit(2000);

    if (error) {
      console.warn('[build] could not list tours to prerender:', error.message);
      return [];
    }
    return (data ?? []).map((row) => ({ locale: row.locale as string, slug: row.slug }));
  } catch (cause) {
    console.warn('[build] tour prerender list unavailable, continuing:', cause);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const tour = await getTourBySlug(slug, locale);
  if (!tour) return { robots: { index: false, follow: false } };

  const slugs = await getTourSlugsByLocale(tour.id);

  const title = tour.metaTitle
    ?? composeTitle([tour.title, `${tour.city.name} ${new Date().getFullYear()}`]);

  const description = tour.metaDescription
    ?? truncateDescription(
      `${tour.summary ?? tour.title} From ${formatMoney(tour.fromPrice, tour.currency, locale)} per adult.`
      + (tour.cancellationHours ? ` Free cancellation up to ${tour.cancellationHours}h before.` : ''),
    );

  return buildMetadata({
    locale,
    title,
    description,
    type: 'product',
    // Only locales this tour is actually translated into get an alternate.
    // Pointing hreflang at a URL that 404s is worse than omitting it.
    path: (candidate) => {
      const translated = slugs.get(candidate);
      return translated ? routes.tour(candidate, translated) : null;
    },
    image: tour.media[0]
      ? { url: tour.media[0].url, width: tour.media[0].width ?? 1200, height: tour.media[0].height ?? 630, alt: tour.media[0].alt }
      : null,
    modifiedTime: tour.updatedAt,
    publishedTime: tour.publishedAt ?? undefined,
  });
}

export default async function TourPage({ params }: { params: Promise<Params> }) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const tour = await getTourBySlug(slug, locale);
  if (!tour) notFound();

  const [options, reviewSummary, reviews, related, nearby] = await Promise.all([
    getAvailability(tour.id, locale, tour.currency),
    getReviewSummary(tour.id, locale),
    getTourReviews(tour.id, locale),
    getRelatedTours(tour, locale),
    getNearbyPlaces(tour, locale),
  ]);

  const livePrice = lowestAvailablePrice(options, tour.fromPrice);
  const url = absolute(routes.tour(locale, slug));

  const answerInput = {
    title: tour.title,
    cityName: tour.city.name,
    countryName: tour.country.name,
    price: livePrice,
    currency: tour.currency,
    durationMinutes: tour.durationMinutes,
    ratingAvg: reviewSummary.average,
    ratingCount: reviewSummary.count,
    cancellationHours: tour.cancellationHours,
    pickupIncluded: tour.pickupIncluded,
    confirmation: tour.confirmation,
    languages: tour.guideLocales,
  };

  // Supplier FAQs first; generated questions fill the gaps they didn't answer.
  const supplierQuestions = new Set(tour.faqs.map((f) => f.question.toLowerCase()));
  const faqs = [
    ...tour.faqs,
    ...generatedQuestions(answerInput).filter((q) => !supplierQuestions.has(q.question.toLowerCase())),
  ];

  const trail: Crumb[] = [
    { name: 'Home', path: routes.home(locale) },
    { name: tour.country.name, path: routes.country(locale, tour.country.slug) },
    { name: tour.city.name, path: routes.city(locale, tour.country.slug, tour.city.slug) },
    { name: tour.category.name, path: routes.cityCategory(locale, tour.country.slug, tour.city.slug, tour.category.slug) },
    { name: tour.title, path: routes.tour(locale, slug) },
  ];

  return (
    <>
      <JsonLd
        id="tour"
        data={graph(
          breadcrumbSchema(trail),
          tourSchema({
            id: tour.id,
            url,
            name: tour.title,
            description: tour.summary ?? tour.title,
            images: tour.media.slice(0, 6).map((m) => m.url),
            cityName: tour.city.name,
            countryCode: tour.country.iso2,
            latitude: tour.meetingPoint?.lat ?? tour.city.lat,
            longitude: tour.meetingPoint?.lng ?? tour.city.lng,
            durationMinutes: tour.durationMinutes,
            currency: tour.currency,
            price: livePrice,
            availabilityFrom: nextAvailableDate(options),
            ratingAvg: reviewSummary.average,
            ratingCount: reviewSummary.count,
            operatorName: tour.company.name,
            operatorUrl: absolute(routes.company(locale, tour.company.slug)),
            locale,
            languages: tour.guideLocales,
            minAge: tour.minAge,
          }),
          faqSchema(faqs),
          ...reviewSchema(
            reviews.slice(0, 5).map((r) => ({
              author: r.authorName,
              rating: r.rating,
              body: r.body ?? '',
              datePublished: r.createdAt,
            })),
          ),
        )}
      />

      <article className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6">
        <header className="flex flex-col gap-3">
          <Breadcrumbs trail={trail} />
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] leading-tight md:text-[var(--text-4xl)]">
            {tour.title}
          </h1>
        </header>

        <Gallery photos={tour.media} title={tour.title} />

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-8">
            <AnswerSummary
              summary={tourAnswerSummary(answerInput, locale)}
              facts={[
                { icon: 'duration', label: 'Duration', value: formatDuration(tour.durationMinutes, locale) },
                { icon: 'price', label: 'From', value: formatMoney(livePrice, tour.currency, locale) },
                { icon: 'confirmation', label: 'Confirmation', value: tour.confirmation === 'instant' ? 'Instant' : 'Within 24 hours' },
                { icon: 'cancellation', label: 'Cancellation', value: tour.cancellationHours ? `Free up to ${tour.cancellationHours}h` : 'Non-refundable' },
                { icon: 'rating', label: 'Rating', value: reviewSummary.count ? `${reviewSummary.average.toFixed(1)} (${reviewSummary.count})` : 'Not yet reviewed' },
                { icon: 'languages', label: 'Guides speak', value: tour.guideLocales.map((l) => LOCALES.includes(l as Locale) ? l.toUpperCase() : l).join(', ') },
              ]}
            />

            {tour.highlights.length > 0 && (
              <section aria-labelledby="highlights-heading" className="flex flex-col gap-3">
                <h2 id="highlights-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                  What you'll do
                </h2>
                <ul className="flex flex-col gap-2">
                  {tour.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-2.5 text-[var(--text-base)] text-[var(--ink-soft)]">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--teal)]" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tour.description && (
              <section aria-labelledby="about-heading" className="flex flex-col gap-3">
                <h2 id="about-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                  About this experience
                </h2>
                <p className="whitespace-pre-line text-[var(--text-base)] leading-relaxed text-[var(--ink-soft)]">
                  {tour.description}
                </p>
              </section>
            )}

            {tour.itinerary.length > 0 && (
              <section aria-labelledby="itinerary-heading" className="flex flex-col gap-3">
                <h2 id="itinerary-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                  Itinerary
                </h2>
                {/* Numbered because the content genuinely is a sequence —
                    the stops happen in this order and the order matters. */}
                <ol className="flex flex-col border-s border-[var(--hairline)] ps-5">
                  {tour.itinerary.map((stop) => (
                    <li key={stop.position} className="relative pb-5 last:pb-0">
                      <span aria-hidden className="absolute -start-[26px] top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--teal)] text-[10px] font-bold text-white">
                        {stop.position + 1}
                      </span>
                      <p className="text-[var(--text-base)] font-semibold">{stop.title}</p>
                      {stop.durationMinutes && (
                        <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">{formatDuration(stop.durationMinutes, locale)}</p>
                      )}
                      {stop.description && (
                        <p className="pt-1 text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{stop.description}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section aria-labelledby="included-heading" className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h2 id="included-heading" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
                  What's included
                </h2>
                <ul className="flex flex-col gap-1.5 text-[var(--text-sm)] text-[var(--ink-soft)]">
                  {tour.inclusions.map((item) => <li key={item}>✓ {item}</li>)}
                </ul>
              </div>
              {tour.exclusions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">Not included</h2>
                  <ul className="flex flex-col gap-1.5 text-[var(--text-sm)] text-[var(--ink-faint)]">
                    {tour.exclusions.map((item) => <li key={item}>✕ {item}</li>)}
                  </ul>
                </div>
              )}
            </section>

            {tour.knowBeforeYouGo && (
              <section aria-labelledby="kbyg-heading" className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-5">
                <h2 id="kbyg-heading" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
                  Know before you go
                </h2>
                <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{tour.knowBeforeYouGo}</p>
              </section>
            )}

            <ReviewSection summary={reviewSummary} reviews={reviews} locale={locale} tourTitle={tour.title} />

            <FaqAccordion faqs={faqs} heading={`Questions about ${tour.title}`} />

            {nearby.length > 0 && (
              <section aria-labelledby="nearby-heading" className="flex flex-col gap-3">
                <h2 id="nearby-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
                  Nearby in {tour.city.name}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {nearby.map((place) => (
                    <li key={place.id}>
                      <a
                        href={routes.attraction(locale, tour.country.slug, tour.city.slug, place.slug)}
                        className="inline-block rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--text-sm)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
                      >
                        {place.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <BookingWidget
              tourId={tour.id}
              locale={locale}
              currency={tour.currency}
              options={options}
              cancellationHours={tour.cancellationHours}
              timezone={tour.city.timezone}
            />
          </aside>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="flex flex-col gap-4">
            <h2 id="related-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
              More {tour.category.name.toLowerCase()} in {tour.city.name}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item, index) => (
                <TourCard
                  key={item.id}
                  locale={locale}
                  position={index + 1}
                  tour={{
                    id: item.id,
                    slug: item.slug,
                    title: item.title,
                    summary: item.summary,
                    coverUrl: item.coverUrl ?? '/placeholder-tour.svg',
                    coverBlurhash: item.coverBlurhash,
                    altText: item.coverAlt ?? `${item.title} in ${item.cityName}`,
                    cityName: item.cityName,
                    durationMinutes: item.durationMinutes,
                    fromPrice: item.fromPrice,
                    compareAtPrice: null,
                    currency: item.currency,
                    ratingAvg: item.ratingAvg,
                    ratingCount: item.ratingCount,
                    instantConfirmation: item.confirmation === 'instant',
                    pickupIncluded: item.pickupIncluded,
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}
