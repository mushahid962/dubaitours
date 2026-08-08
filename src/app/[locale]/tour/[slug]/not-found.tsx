import Link from 'next/link';
import { routes } from '@/lib/seo/routes';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';

/**
 * A tour that was removed or renamed. Travellers arrive here from an old
 * bookmark or a stale search result, so the page routes them somewhere useful
 * instead of explaining an HTTP status code.
 */
export default function TourNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-24">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
        This experience is no longer available
      </h1>
      <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
        The operator removed it, or the link has changed. There are usually similar
        experiences running in the same city.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href={routes.search(DEFAULT_LOCALE)}
          className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
        >
          Search experiences
        </Link>
        <Link
          href={routes.home(DEFAULT_LOCALE)}
          className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2.5 text-[var(--text-sm)] font-semibold"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
