import Link from 'next/link';
import { X, SlidersHorizontal } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';

export type FilterState = {
  amenities: string[];
  priceMin: number | null;
  priceMax: number | null;
  minRating: number | null;
  duration: string | null;
  timeOfDay: string | null;
  availability: string | null;
  instant: boolean;
  freeCancellation: boolean;
  area: string | null;
  sort: string;
};

type Facets = {
  amenities: Array<{ value: string; count: number }>;
  areas: Array<{ value: string; label: string; count: number }>;
  priceRange: { min: number; max: number } | null;
};

const DURATIONS = [
  { value: '0-2', label: 'Up to 2 hours' },
  { value: '2-4', label: '2 – 4 hours' },
  { value: '4-8', label: 'Half day' },
  { value: '8-24', label: 'Full day' },
  { value: '24-', label: 'Multi-day' },
];

const TIMES = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
];

const AVAILABILITY = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week', label: 'Next 7 days' },
];

/**
 * Filters as links, not client state.
 *
 * Every combination is a URL, so a filtered view is shareable, back-button
 * safe and crawlable, and the rail ships no JavaScript. The trade is a
 * navigation per click; on a directory whose growth depends on Google, that
 * is the right way round.
 */
export function FilterRail({
  facets, basePath, state, locale, currency, total, showActivityFilters,
}: {
  facets: Facets; basePath: string; state: FilterState;
  locale: Locale; currency: string; total: number; showActivityFilters: boolean;
}) {
  const build = (patch: Partial<Record<string, string | undefined>>) => {
    const params = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      amenities: state.amenities.join(',') || undefined,
      priceMin: state.priceMin?.toString(),
      priceMax: state.priceMax?.toString(),
      rating: state.minRating?.toString(),
      duration: state.duration ?? undefined,
      time: state.timeOfDay ?? undefined,
      when: state.availability ?? undefined,
      instant: state.instant ? '1' : undefined,
      free: state.freeCancellation ? '1' : undefined,
      area: state.area ?? undefined,
      sort: state.sort !== 'recommended' ? state.sort : undefined,
    };
    for (const [key, value] of Object.entries({ ...current, ...patch })) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return `${basePath}${query ? `?${query}` : ''}`;
  };

  const toggleAmenity = (value: string) => {
    const next = state.amenities.includes(value)
      ? state.amenities.filter((a) => a !== value)
      : [...state.amenities, value];
    return build({ amenities: next.length ? next.join(',') : undefined });
  };

  const activeCount =
    state.amenities.length +
    [state.priceMin, state.priceMax, state.minRating, state.duration,
     state.timeOfDay, state.availability, state.area].filter(Boolean).length +
    (state.instant ? 1 : 0) + (state.freeCancellation ? 1 : 0);

  const priceBands = facets.priceRange
    ? [
        { label: `Under ${formatMoney(Math.round(facets.priceRange.min * 2), currency, locale)}`,
          max: Math.round(facets.priceRange.min * 2) },
        { label: `Under ${formatMoney(Math.round(facets.priceRange.min * 4), currency, locale)}`,
          max: Math.round(facets.priceRange.min * 4) },
      ]
    : [];

  return (
    <aside aria-label="Filters" className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[var(--text-sm)] font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden />
          {total.toLocaleString(locale)} result{total === 1 ? '' : 's'}
        </p>
        {activeCount > 0 && (
          <Link href={basePath}
            className="inline-flex items-center gap-1 text-[var(--text-xs)] text-[var(--ink-faint)] underline">
            <X className="h-3 w-3" aria-hidden /> Clear {activeCount}
          </Link>
        )}
      </div>

      {facets.priceRange && (
        <Group title="Price">
          {priceBands.map((band) => (
            <Row key={band.max} href={build({ priceMax: state.priceMax === band.max ? undefined : String(band.max) })}
              active={state.priceMax === band.max} label={band.label} />
          ))}
          <p className="px-2 pt-1 text-[var(--text-xs)] text-[var(--ink-faint)]">
            {formatMoney(facets.priceRange.min, currency, locale)} –{' '}
            {formatMoney(facets.priceRange.max, currency, locale)}
          </p>
        </Group>
      )}

      <Group title="Rating">
        {[4.5, 4.0, 3.5].map((rating) => (
          <Row key={rating} href={build({ rating: state.minRating === rating ? undefined : String(rating) })}
            active={state.minRating === rating} label={`${rating.toFixed(1)} and up`} />
        ))}
      </Group>

      {/* Duration, time of day and availability only make sense for something
          you book. A mall has no departure time, and showing these on a mall
          page teaches people the filters are noise. */}
      {showActivityFilters && (
        <>
          <Group title="Availability">
            {AVAILABILITY.map((option) => (
              <Row key={option.value}
                href={build({ when: state.availability === option.value ? undefined : option.value })}
                active={state.availability === option.value} label={option.label} />
            ))}
          </Group>

          <Group title="Duration">
            {DURATIONS.map((option) => (
              <Row key={option.value}
                href={build({ duration: state.duration === option.value ? undefined : option.value })}
                active={state.duration === option.value} label={option.label} />
            ))}
          </Group>

          <Group title="Time of day">
            {TIMES.map((option) => (
              <Row key={option.value}
                href={build({ time: state.timeOfDay === option.value ? undefined : option.value })}
                active={state.timeOfDay === option.value} label={option.label} />
            ))}
          </Group>

          <Group title="Booking">
            <Row href={build({ instant: state.instant ? undefined : '1' })}
              active={state.instant} label="Instant confirmation" />
            <Row href={build({ free: state.freeCancellation ? undefined : '1' })}
              active={state.freeCancellation} label="Free cancellation" />
          </Group>
        </>
      )}

      {facets.areas.length > 0 && (
        <Group title="Area">
          {facets.areas.slice(0, 10).map((area) => (
            <Row key={area.value}
              href={build({ area: state.area === area.value ? undefined : area.value })}
              active={state.area === area.value} label={area.label} count={area.count} />
          ))}
        </Group>
      )}

      {facets.amenities.length > 0 && (
        <Group title="Features">
          {facets.amenities.slice(0, 14).map((amenity) => (
            <Row key={amenity.value} href={toggleAmenity(amenity.value)}
              active={state.amenities.includes(amenity.value)}
              label={amenity.value} count={amenity.count} capitalize />
          ))}
        </Group>
      )}
    </aside>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-1">
    <h3 className="px-2 text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
      {title}
    </h3>
    <ul className="flex flex-col">{children}</ul>
  </section>
);

function Row({ href, active, label, count, capitalize }: {
  href: string; active: boolean; label: string; count?: number; capitalize?: boolean;
}) {
  return (
    <li>
      <Link href={href} aria-pressed={active}
        className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[var(--text-sm)] hover:bg-[var(--limestone)] ${
          active ? 'font-semibold text-[var(--teal)]' : 'text-[var(--ink-soft)]'
        }`}>
        <span aria-hidden className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border text-[10px] ${
          active ? 'border-[var(--teal)] bg-[var(--teal)] text-white' : 'border-[var(--hairline)]'
        }`}>{active ? '✓' : ''}</span>
        <span className={`flex-1 ${capitalize ? 'capitalize' : ''}`}>{label}</span>
        {count !== undefined && (
          <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{count}</span>
        )}
      </Link>
    </li>
  );
}
