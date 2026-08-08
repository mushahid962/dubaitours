import Link from 'next/link';
import { X } from 'lucide-react';

type Facets = {
  amenities: Array<{ value: string; count: number }>;
  priceLevels: Array<{ value: number; count: number }>;
  ratings: Array<{ value: number; count: number }>;
};

/**
 * Filter sidebar, built from links.
 *
 * Same reasoning as the tour filters: every state is a URL, so a filtered
 * view is shareable, crawlable and back-button-safe, and the sidebar needs
 * no JavaScript at all.
 */
export function DirectoryFilters({
  facets, basePath, params, total,
}: {
  facets: Facets; basePath: string;
  params: { amenities: string[]; priceLevel: number | null; minRating: number | null; sort: string };
  total: number;
}) {
  const build = (patch: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const amenities = patch.amenities !== undefined
      ? patch.amenities : params.amenities.join(',') || undefined;
    if (amenities) search.set('amenities', amenities);

    const price = patch.price !== undefined ? patch.price : params.priceLevel?.toString();
    if (price) search.set('price', price);

    const rating = patch.rating !== undefined ? patch.rating : params.minRating?.toString();
    if (rating) search.set('rating', rating);

    if (params.sort && params.sort !== 'recommended') search.set('sort', params.sort);
    const query = search.toString();
    return `${basePath}${query ? `?${query}` : ''}`;
  };

  const toggleAmenity = (value: string) => {
    const next = params.amenities.includes(value)
      ? params.amenities.filter((a) => a !== value)
      : [...params.amenities, value];
    return build({ amenities: next.length ? next.join(',') : undefined });
  };

  const activeCount = params.amenities.length + (params.priceLevel ? 1 : 0) + (params.minRating ? 1 : 0);

  return (
    <aside aria-label="Filters" className="flex flex-col gap-5 lg:w-64 lg:shrink-0">
      <div className="flex items-center justify-between">
        <p className="text-[var(--text-sm)] font-semibold">
          {total.toLocaleString()} result{total === 1 ? '' : 's'}
        </p>
        {activeCount > 0 && (
          <Link href={basePath} className="inline-flex items-center gap-1 text-[var(--text-xs)] text-[var(--ink-faint)] underline">
            <X className="h-3 w-3" aria-hidden /> Clear {activeCount}
          </Link>
        )}
      </div>

      {facets.ratings.length > 0 && (
        <Group title="Rating">
          {facets.ratings.map((r) => (
            <Row key={r.value} href={build({ rating: params.minRating === r.value ? undefined : String(r.value) })}
              active={params.minRating === r.value} label={`${r.value.toFixed(1)} and up`} count={r.count} />
          ))}
        </Group>
      )}

      {facets.priceLevels.length > 0 && (
        <Group title="Price">
          {facets.priceLevels.map((p) => (
            <Row key={p.value} href={build({ price: params.priceLevel === p.value ? undefined : String(p.value) })}
              active={params.priceLevel === p.value} label={'$'.repeat(p.value)} count={p.count} />
          ))}
        </Group>
      )}

      {facets.amenities.length > 0 && (
        <Group title="Amenities">
          {facets.amenities.map((a) => (
            <Row key={a.value} href={toggleAmenity(a.value)}
              active={params.amenities.includes(a.value)}
              label={a.value} count={a.count} capitalize />
          ))}
        </Group>
      )}
    </aside>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <h2 className="text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">{title}</h2>
    <ul className="flex flex-col">{children}</ul>
  </section>
);

function Row({ href, active, label, count, capitalize }: {
  href: string; active: boolean; label: string; count: number; capitalize?: boolean;
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
        <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{count}</span>
      </Link>
    </li>
  );
}
