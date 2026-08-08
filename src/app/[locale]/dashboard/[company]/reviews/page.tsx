import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { getCompanyBySlug } from '@/services/dashboard-repository';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/format';
import { ReviewReply } from '@/components/dashboard/review-reply';

export const dynamic = 'force-dynamic';

export default async function DashboardReviews({
  params,
}: { params: Promise<{ locale: string; company: string }> }) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, title, body, created_at, supplier_reply, supplier_replied_at, traveler_type, tour_id')
    .eq('company_id', company.id).eq('status', 'published')
    .order('supplier_reply', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(100);

  const reviews = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id), rating: Number(row.rating),
    title: row.title ?? null, body: row.body ?? null,
    createdAt: String(row.created_at), reply: row.supplier_reply ?? null,
    travellerType: row.traveler_type ?? null,
  }));

  const unanswered = reviews.filter((r) => !r.reply);
  const average = reviews.length
    ? Math.round((reviews.reduce((t, r) => t + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-6 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
        <div className="flex flex-col">
          <span className="text-[var(--text-3xl)] font-bold">{average.toFixed(1)}</span>
          <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
            {reviews.length} review{reviews.length === 1 ? '' : 's'}
          </span>
        </div>
        {unanswered.length > 0 && (
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            <strong>{unanswered.length} without a reply.</strong> Replies are public, and a
            considered response to a critical review is read far more often than the review itself.
          </p>
        )}
      </header>

      {reviews.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          No reviews yet. Only travellers who completed a booking can leave one, so they start
          arriving after your first departures run.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1" aria-label={`${review.rating} out of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} aria-hidden
                      className={`h-4 w-4 ${i < review.rating ? 'fill-[var(--brass)] text-[var(--brass)]' : 'text-[var(--limestone)]'}`} />
                  ))}
                </span>
                <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {review.travellerType && `${review.travellerType} · `}{formatDate(review.createdAt, locale)}
                </span>
              </div>

              {review.title && <p className="font-semibold">{review.title}</p>}
              {review.body && <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{review.body}</p>}

              <ReviewReply reviewId={review.id} existingReply={review.reply} rating={review.rating} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
