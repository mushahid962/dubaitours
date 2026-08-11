import Link from 'next/link';
import type { BusinessCategory } from '@/services/taxonomy-repository';

/**
 * The persistent category rail.
 *
 * Present on every directory page, which does two jobs at once: a visitor can
 * jump between categories without going back to the city hub, and every
 * category page links to every sibling — the internal linking that gets a
 * long tail of `/city/category/subcategory` pages discovered and crawled.
 */
export function CategorySidebar({
  categories, cityName, activeCategory, activeSub, hrefFor,
}: {
  categories: BusinessCategory[];
  cityName: string;
  activeCategory?: string;
  activeSub?: string;
  hrefFor: (category: string, sub?: string) => string;
}) {
  return (
    <nav aria-label={`Categories in ${cityName}`} className="flex flex-col gap-4">
      <h2 className="text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
        In {cityName}
      </h2>

      <ul className="flex flex-col gap-0.5">
        {categories.map((category) => {
          const isActive = category.slug === activeCategory;
          const children = category.children ?? [];

          return (
            <li key={category.id}>
              <Link
                href={hrefFor(category.slug)}
                aria-current={isActive && !activeSub ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[var(--text-sm)] ${
                  isActive
                    ? 'bg-[var(--teal-wash)] font-semibold text-[var(--teal-deep)]'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--limestone)]'
                }`}
              >
                <span className="flex-1 truncate">{category.name}</span>
                {category.listingCount > 0 && (
                  <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                    {category.listingCount}
                  </span>
                )}
              </Link>

              {/* Children only under the open category. Rendering all ~20
                  subcategories at once turns a useful rail into a wall. */}
              {isActive && children.length > 0 && (
                <ul className="ms-3 flex flex-col gap-0.5 border-s border-[var(--hairline)] ps-2 pt-1">
                  {children.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        href={hrefFor(category.slug, sub.slug)}
                        aria-current={sub.slug === activeSub ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-sm)] ${
                          sub.slug === activeSub
                            ? 'font-semibold text-[var(--teal)]'
                            : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span className="flex-1 truncate">{sub.name}</span>
                        {sub.listingCount > 0 && (
                          <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{sub.listingCount}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
