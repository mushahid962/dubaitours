import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * One heading pattern for every rail on the page. Doing this in one component
 * is what stops a long homepage turning into eight slightly different
 * headings with eight slightly different spacings.
 */
export function Section({
  id, title, subtitle, href, hrefLabel, tone = 'default', children,
}: {
  id: string; title: string; subtitle?: string;
  href?: string; hrefLabel?: string;
  tone?: 'default' | 'band';
  children: React.ReactNode;
}) {
  const body = (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] md:text-[var(--text-3xl)]">
            {title}
          </h2>
          {subtitle && <p className="max-w-xl text-[var(--text-sm)] text-[var(--ink-soft)]">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
            {hrefLabel ?? 'See all'} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        )}
      </header>
      {children}
    </div>
  );

  return tone === 'band' ? (
    <section aria-labelledby={id} className="bg-[var(--limestone)] py-14">{body}</section>
  ) : (
    <section aria-labelledby={id} className="py-14">{body}</section>
  );
}
