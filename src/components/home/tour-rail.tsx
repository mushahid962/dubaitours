import { TourCard } from '@/components/tours/tour-card';
import type { SearchResult } from '@/services/search-repository';
import type { Locale } from '@/lib/i18n/config';

/**
 * Horizontal rail of tour cards.
 *
 * Uses CSS scroll-snap rather than a JavaScript carousel: it works with touch,
 * trackpad, keyboard and screen readers for free, ships no JS, and does not
 * trap focus the way a custom slider usually does.
 */
export function TourRail({
  tours, locale, priority = false,
}: { tours: SearchResult[]; locale: Locale; priority?: boolean }) {
  if (!tours.length) return null;

  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
      {tours.map((tour, index) => (
        <li key={tour.id} className="w-[78vw] shrink-0 snap-start sm:w-[46vw] lg:w-[23rem]">
          <TourCard
            locale={locale}
            position={index + 1}
            priority={priority && index === 0}
            tour={{
              id: tour.id,
              slug: tour.slug,
              title: tour.title,
              summary: tour.summary,
              coverUrl: tour.coverUrl ?? '/placeholder-tour.svg',
              coverBlurhash: tour.coverBlurhash,
              altText: tour.coverAlt ?? `${tour.title} in ${tour.cityName}`,
              cityName: tour.cityName,
              durationMinutes: tour.durationMinutes,
              fromPrice: tour.fromPrice,
              compareAtPrice: tour.discountPct > 0
                ? Math.round((tour.fromPrice / (1 - tour.discountPct / 100)) * 100) / 100
                : null,
              currency: tour.currency,
              ratingAvg: tour.ratingAvg,
              ratingCount: tour.ratingCount,
              instantConfirmation: tour.confirmation === 'instant',
              pickupIncluded: tour.pickupIncluded,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
