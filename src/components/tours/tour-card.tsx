import Image from 'next/image';
import Link from 'next/link';
import { Star, Clock, MapPin, Zap, BadgeCheck } from 'lucide-react';
import { routes } from '@/lib/seo/routes';
import type { Locale } from '@/lib/i18n/config';
import { formatMoney, formatDuration } from '@/lib/format';

export type TourCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string;
  coverBlurhash?: string | null;
  altText: string;
  cityName: string;
  durationMinutes: number;
  fromPrice: number;
  compareAtPrice: number | null;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
  instantConfirmation: boolean;
  pickupIncluded: boolean;
  isFeatured?: boolean;
  seatsLeft?: number | null;
};

type Props = {
  tour: TourCardData;
  locale: Locale;
  /** `priority` on the first row only — everything below the fold lazy-loads. */
  priority?: boolean;
  position?: number;
};

/**
 * The listing card. It carries the four facts that decide a click — price,
 * rating, duration, confirmation speed — and nothing that doesn't.
 *
 * Markup is semantic on purpose: <article> with a real heading, a visible
 * <time>, and the price in a <data> element. Crawlers and language models
 * both read this card without needing the JSON-LD to disambiguate it.
 */
export function TourCard({ tour, locale, priority = false, position }: Props) {
  const href = routes.tour(locale, tour.slug);
  const hasDiscount = tour.compareAtPrice !== null && tour.compareAtPrice > tour.fromPrice;
  const discountPct = hasDiscount
    ? Math.round(((tour.compareAtPrice! - tour.fromPrice) / tour.compareAtPrice!) * 100)
    : 0;

  return (
    <article
      className="dune-lift group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--paper)] shadow-[var(--shadow-card)]"
      data-position={position}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--limestone)]">
        <Image
          src={tour.coverUrl}
          alt={tour.altText}
          fill
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 23vw"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          placeholder={tour.coverBlurhash ? 'blur' : 'empty'}
          blurDataURL={tour.coverBlurhash ?? undefined}
          className="object-cover transition-transform duration-[600ms] ease-[var(--ease-out)] group-hover:scale-[1.04]"
        />

        {tour.isFeatured && (
          <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--brass-wash)] px-2.5 py-1 text-[var(--text-xs)] font-semibold text-[var(--brass)]">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Featured
          </span>
        )}

        {discountPct >= 10 && (
          <span className="absolute end-3 top-3 rounded-[var(--radius-pill)] bg-[var(--pomegranate)] px-2.5 py-1 text-[var(--text-xs)] font-bold text-white">
            −{discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="flex items-center gap-1 text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {tour.cityName}
        </p>

        <h3 className="text-[var(--text-lg)] font-semibold leading-snug text-[var(--ink)]">
          {/* Whole-card click target without nesting interactive elements. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {tour.title}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-sm)] text-[var(--ink-soft)]">
          {tour.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 fill-[var(--brass)] text-[var(--brass)]" aria-hidden />
              <strong className="font-semibold text-[var(--ink)]">{tour.ratingAvg.toFixed(1)}</strong>
              <span className="text-[var(--ink-faint)]">({tour.ratingCount.toLocaleString(locale)})</span>
            </span>
          ) : (
            <span className="text-[var(--ink-faint)]">New</span>
          )}

          <time className="inline-flex items-center gap-1" dateTime={`PT${tour.durationMinutes}M`}>
            <Clock className="h-4 w-4" aria-hidden />
            {formatDuration(tour.durationMinutes, locale)}
          </time>
        </div>

        <ul className="flex flex-wrap gap-1.5 text-[var(--text-xs)]">
          {tour.instantConfirmation && (
            <li className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--teal-wash)] px-2 py-0.5 text-[var(--teal-deep)]">
              <Zap className="h-3 w-3" aria-hidden /> Instant confirmation
            </li>
          )}
          {tour.pickupIncluded && (
            <li className="rounded-[var(--radius-sm)] bg-[var(--limestone)] px-2 py-0.5 text-[var(--ink-soft)]">
              Hotel pickup
            </li>
          )}
        </ul>

        <div className="mt-auto flex items-end justify-between pt-2">
          <p className="flex flex-col">
            {hasDiscount && (
              <span className="text-[var(--text-xs)] text-[var(--ink-faint)] line-through">
                {formatMoney(tour.compareAtPrice!, tour.currency, locale)}
              </span>
            )}
            <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">from</span>
            <data value={tour.fromPrice} className="text-[var(--text-xl)] font-bold text-[var(--ink)]">
              {formatMoney(tour.fromPrice, tour.currency, locale)}
            </data>
          </p>

          {typeof tour.seatsLeft === 'number' && tour.seatsLeft <= 5 && tour.seatsLeft > 0 && (
            <p className="text-[var(--text-xs)] font-semibold text-[var(--pomegranate)]">
              {tour.seatsLeft} places left
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
