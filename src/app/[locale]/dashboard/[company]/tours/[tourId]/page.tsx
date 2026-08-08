import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { getCompanyBySlug, getTourForEditor } from '@/services/dashboard-repository';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { routes } from '@/lib/seo/routes';
import { SeoPanel } from '@/components/dashboard/seo-panel';
import { ContentPanel } from '@/components/dashboard/content-panel';
import { SubmitPanel } from '@/components/dashboard/submit-panel';
import { AvailabilityPanel } from '@/components/dashboard/availability-panel';
import { MediaPanel } from '@/components/dashboard/media-panel';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; company: string; tourId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const TABS = ['content', 'photos', 'seo', 'pricing', 'availability', 'publish'] as const;

export default async function TourEditor({ params, searchParams }: Props) {
  const { locale: raw, company: slug, tourId } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const basePath = `${prefix}/dashboard/${slug}`;

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const editor = await getTourForEditor(tourId, locale);
  if (!editor) notFound();

  const { tour, translation, options, completeness } = editor;
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? '') ? rawTab! : 'content';

  const supabase = await getSupabaseServerClient();
  const { data: optionRows } = await supabase
    .from('tour_options')
    .select('id, code, translations:tour_option_translations ( name, locale )')
    .eq('tour_id', tourId);

  const optionList = ((optionRows ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    name: (row.translations ?? []).find((t: any) => t.locale === locale)?.name ?? String(row.code),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`${basePath}/tours`} className="text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)]">
            ← All listings
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
            {translation?.title ?? 'Untitled listing'}
          </h2>
          <p className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--ink-faint)]">
            {tour.status === 'published' ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--teal)]" aria-hidden /> Live
                {translation?.slug && (
                  <Link href={routes.tour(locale, String(translation.slug))} target="_blank"
                    className="inline-flex items-center gap-1 text-[var(--teal)] hover:underline">
                    View page <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </>
            ) : (
              <>Status: {String(tour.status).replace(/_/g, ' ')}</>
            )}
          </p>
        </div>

        <div className="flex w-48 flex-col gap-1">
          <span className="flex justify-between text-[var(--text-xs)] text-[var(--ink-faint)]">
            Ready to publish
            <span className={completeness.score >= 80 ? 'text-[var(--teal)]' : 'text-[var(--brass)]'}>
              {completeness.score}%
            </span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-[var(--limestone)]">
            <span className="block h-full rounded-full"
              style={{ width: `${completeness.score}%`, background: completeness.score >= 80 ? 'var(--teal)' : 'var(--brass)' }} />
          </span>
        </div>
      </header>

      {tour.rejected_reason && (
        <p className="flex items-start gap-2 rounded-[var(--radius-lg)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-4 text-[var(--text-sm)] text-[var(--pomegranate)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>Our reviewer asked for changes:</strong> {String(tour.rejected_reason)}</span>
        </p>
      )}

      {/* Tabs are links, so each panel is a fresh server render and a
          half-finished edit can never be silently swapped out from under you. */}
      <nav aria-label="Editor sections" className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]">
        {TABS.map((item) => (
          <Link key={item} href={`${basePath}/tours/${tourId}?tab=${item}`}
            aria-current={item === tab ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-4 py-2 text-[var(--text-sm)] font-medium capitalize ${
              item === tab
                ? 'border-[var(--teal)] text-[var(--teal)]'
                : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}>
            {item}
          </Link>
        ))}
      </nav>

      {tab === 'content' && (
        <ContentPanel tourId={tourId} locale={locale} translation={translation} />
      )}

      {tab === 'photos' && (
        <MediaPanel
          tourId={tourId}
          companyId={String(company.id)}
          locale={locale}
          photos={editor.media.map((row) => ({
            mediaId: String(row.media_id),
            url: String(row.media?.url ?? ''),
            isCover: Boolean(row.is_cover),
            altText: (row.alt_text as Record<string, string>)?.[locale] ?? '',
          }))}
        />
      )}

      {tab === 'seo' && (
        <SeoPanel
          tourId={tourId} locale={locale}
          slug={String(translation?.slug ?? '')}
          metaTitle={translation?.meta_title ?? null}
          metaDescription={translation?.meta_description ?? null}
          fallbackTitle={String(translation?.title ?? 'Untitled listing')}
          fallbackSummary={translation?.summary ?? null}
          isPublished={tour.status === 'published'}
        />
      )}

      {tab === 'pricing' && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
          <h3 className="text-[var(--text-lg)] font-semibold">Options and prices</h3>
          {options.length === 0 ? (
            <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
              No options yet. An option is a version of your experience travellers can pick —
              "Shared 4x4" and "Private vehicle" are two options on one listing.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {options.map((option) => (
                <li key={String(option.id)} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--limestone)] p-3">
                  <span className="font-medium">{String(option.code)}</span>
                  <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">
                    {(option.prices ?? []).length} price{(option.prices ?? []).length === 1 ? '' : 's'} set
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'availability' && (
        <AvailabilityPanel options={optionList} />
      )}

      {tab === 'publish' && (
        <SubmitPanel
          tourId={tourId} status={String(tour.status)}
          score={completeness.score} missing={completeness.missing}
        />
      )}
    </div>
  );
}
