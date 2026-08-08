import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type Crumb = { name: string; path: string };

/**
 * Visible breadcrumbs. The matching BreadcrumbList JSON-LD is emitted by the
 * page from the same array — one source, so the markup and the structured
 * data can't drift.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[var(--text-sm)]">
      <ol className="flex flex-wrap items-center gap-1 text-[var(--ink-soft)]">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1">
              {isLast ? (
                <span aria-current="page" className="text-[var(--ink)]">{crumb.name}</span>
              ) : (
                <>
                  <Link href={crumb.path} className="hover:text-[var(--teal)] hover:underline">
                    {crumb.name}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
