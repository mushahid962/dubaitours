import { notFound } from 'next/navigation';
import { getCompanyBySlug, getDashboardData } from '@/services/dashboard-repository';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { TourTable } from '@/components/dashboard/tour-table';

export const dynamic = 'force-dynamic';

export default async function DashboardTours({
  params,
}: { params: Promise<{ locale: string; company: string }> }) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const basePath = `${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/dashboard/${slug}`;

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();
  const data = await getDashboardData(company.id, locale);
  if (!data) notFound();

  const groups = [
    { key: 'rejected', title: 'Needs your attention', tours: data.tours.filter((t) => t.status === 'rejected') },
    { key: 'in_review', title: 'With our review team', tours: data.tours.filter((t) => t.status === 'in_review') },
    { key: 'published', title: 'Live', tours: data.tours.filter((t) => t.status === 'published') },
    { key: 'draft', title: 'Drafts', tours: data.tours.filter((t) => t.status === 'draft') },
    { key: 'paused', title: 'Paused', tours: data.tours.filter((t) => ['paused', 'archived'].includes(t.status)) },
  ].filter((group) => group.tours.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {/* Grouped by what the supplier must do next, not alphabetically.
          "Needs your attention" first is the whole information design. */}
      {groups.length === 0 ? (
        <TourTable tours={[]} basePath={basePath} locale={locale} />
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={group.key} className="flex flex-col gap-3">
            <h2 id={group.key} className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
              {group.title}
              <span className="ms-2 text-[var(--text-sm)] font-normal text-[var(--ink-faint)]">
                {group.tours.length}
              </span>
            </h2>
            <TourTable tours={group.tours} basePath={basePath} locale={locale} />
          </section>
        ))
      )}
    </div>
  );
}
