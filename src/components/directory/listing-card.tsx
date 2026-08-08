import Image from 'next/image';
import Link from 'next/link';
import { Star, MapPin, BadgeCheck } from 'lucide-react';
import type { DirectoryListing } from '@/services/directory-repository';
import type { Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';

export function ListingCard({
  listing, locale, href, priority,
}: { listing: DirectoryListing; locale: Locale; href: string; priority?: boolean }) {
  return (
    <article className="dune-lift group relative flex gap-4 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--paper)] p-3 shadow-[var(--shadow-card)] sm:flex-col sm:p-0">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--limestone)] sm:h-48 sm:w-full sm:rounded-none">
        {listing.imageUrl ? (
          <Image src={listing.imageUrl} alt={`${listing.name}, ${listing.cityName}`} fill
            sizes="(max-width: 640px) 112px, (max-width: 1024px) 45vw, 23vw"
            priority={priority} loading={priority ? undefined : 'lazy'}
            className="object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center text-[var(--text-xs)] text-[var(--ink-faint)]">
            No photo
          </span>
        )}
        {listing.isFeatured && (
          /* Paid placement is labelled. An unlabelled ad in a directory is
             the thing that destroys trust in the rankings around it. */
          <span className="absolute start-2 top-2 rounded-[var(--radius-pill)] bg-[var(--brass-wash)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brass)]">
            Sponsored
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:p-4">
        <h3 className="text-[var(--text-base)] font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {listing.name}
          </Link>
        </h3>

        <p className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--ink-faint)]">
          {listing.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-[var(--brass)] text-[var(--brass)]" aria-hidden />
              <strong className="text-[var(--ink)]">{listing.rating.toFixed(1)}</strong>
              {listing.ratingCount > 0 && <span>({listing.ratingCount.toLocaleString(locale)})</span>}
            </span>
          )}
          {listing.priceLevel && <span aria-label={`Price level ${listing.priceLevel} of 4`}>{'$'.repeat(listing.priceLevel)}</span>}
        </p>

        {listing.address && (
          <p className="flex items-center gap-1 truncate text-[var(--text-xs)] text-[var(--ink-faint)]">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {listing.address}
          </p>
        )}

        {listing.summary && (
          <p className="line-clamp-2 text-[var(--text-sm)] text-[var(--ink-soft)]">{listing.summary}</p>
        )}

        {listing.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1 pt-1">
            {listing.amenities.slice(0, 3).map((amenity) => (
              <li key={amenity} className="rounded-[var(--radius-sm)] bg-[var(--limestone)] px-1.5 py-0.5 text-[10px] capitalize text-[var(--ink-soft)]">
                {amenity}
              </li>
            ))}
            {listing.amenities.length > 3 && (
              <li className="px-1 text-[10px] text-[var(--ink-faint)]">+{listing.amenities.length - 3}</li>
            )}
          </ul>
        )}

        {listing.priceFrom !== null && (
          <p className="mt-auto pt-2 text-[var(--text-sm)]">
            <span className="text-[var(--ink-faint)]">from </span>
            <strong className="text-[var(--text-lg)]">
              {formatMoney(listing.priceFrom, listing.currency ?? 'AED', locale)}
            </strong>
          </p>
        )}
      </div>
    </article>
  );
}
