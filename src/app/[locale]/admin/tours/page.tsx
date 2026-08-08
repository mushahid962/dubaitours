import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatDate, formatMoney } from '@/lib/format';
import { TourReviewCard } from '@/components/admin/tour-review-card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TourReviewQueue({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  if (!isDatabaseConfigured()) notFound();
  await requireAdmin(locale, '/admin/tours');

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('tours')
    .select(`
      id, status, submitted_at, completeness_score, from_price, base_currency,
      duration_minutes, cancellation, confirmation,
      company:companies ( display_name, slug, verification ),
      translations:tour_translations ( locale, title, slug, description, highlights, meta_description ),
      media:tour_media ( media_id )
    `)
    .eq('status', 'in_review')
    .order('submitted_at', { ascending: true });

  const queue = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => {
    const translation = (row.translations ?? []).find((t: any) => t.locale === locale)
      ?? (row.translations ?? [])[0];
    return {
      id: String(row.id),
      title: translation?.title ?? 'Untitled listing',
      slug: translation?.slug ?? '',
      description: translation?.description ?? '',
      highlights: translation?.highlights ?? [],
      metaDescription: translation?.meta_description ?? null,
      operatorName: row.company?.display_name ?? 'Unknown operator',
      operatorSlug: row.company?.slug ?? '',
      verification: row.company?.verification ?? 'none',
      completeness: Number(row.completeness_score ?? 0),
      photoCount: (row.media ?? []).length,
      price: row.from_price ? formatMoney(Number(row.from_price), String(row.base_currency), locale) : '—',
      duration: `${Math.round(Number(row.duration_minutes) / 60)}h`,
      cancellation: String(row.cancellation).replace(/_/g, ' '),
      submittedAt: row.submitted_at ? formatDate(String(row.submitted_at), locale) : '—',
    };
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Listings awaiting review</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          {queue.length === 0
            ? 'Nothing waiting. Listings appear here when an operator submits them.'
            : `${queue.length} waiting, oldest first. Approving publishes the page immediately.`}
        </p>
        <Link href="/admin/applications" className="w-fit text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
          Partner applications →
        </Link>
      </header>

      {queue.map((tour) => <TourReviewCard key={tour.id} tour={tour} />)}
    </div>
  );
}
