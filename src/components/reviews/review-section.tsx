import Image from 'next/image';
import { Star, BadgeCheck, Sparkles } from 'lucide-react';
import type { ReviewSummary, TourReview } from '@/services/review-repository';
import type { Locale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/format';

type Props = { summary: ReviewSummary; reviews: TourReview[]; locale: Locale; tourTitle: string };

export function ReviewSection({ summary, reviews, locale, tourTitle }: Props) {
  if (!summary.count) {
    return (
      <section aria-labelledby="reviews-heading" className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
        <h2 id="reviews-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">Reviews</h2>
        {/* An empty state that says what's true and what happens next, rather
            than apologising or inventing social proof. */}
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          No reviews yet — this experience is new to TravelHub Gulf. Reviews appear here once travellers
          who booked it have been, so the first one will be someone who actually went.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-heading" className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
          {summary.average.toFixed(1)} from {summary.count.toLocaleString(locale)} verified reviews
        </h2>
      </div>

      <div className="grid gap-5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-1.5">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const pct = Math.round((summary.distribution[star] / summary.count) * 100);
            return (
              <div key={star} className="flex items-center gap-2 text-[var(--text-xs)]">
                <span className="w-3 tabular-nums text-[var(--ink-soft)]">{star}</span>
                <Star className="h-3 w-3 fill-[var(--brass)] text-[var(--brass)]" aria-hidden />
                <span
                  role="img"
                  aria-label={`${star} stars: ${pct}% of reviews`}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--limestone)]"
                >
                  <span className="block h-full rounded-full bg-[var(--brass)]" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-8 text-end tabular-nums text-[var(--ink-faint)]">{pct}%</span>
              </div>
            );
          })}
        </div>

        {summary.aiSummary && (
          <div className="flex flex-col gap-2 border-[var(--hairline)] md:border-s md:ps-5">
            <p className="flex items-center gap-1.5 text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Summarised from {summary.aiSummary.sourceCount} reviews
            </p>
            <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{summary.aiSummary.summary}</p>

            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              {summary.aiSummary.pros.length > 0 && (
                <ul className="flex flex-col gap-1 text-[var(--text-sm)]">
                  {summary.aiSummary.pros.map((pro) => (
                    <li key={pro} className="text-[var(--teal-deep)]">+ {pro}</li>
                  ))}
                </ul>
              )}
              {/* Criticism is shown, not filtered. A page with only praise is
                  the one travellers stop believing. */}
              {summary.aiSummary.cons.length > 0 && (
                <ul className="flex flex-col gap-1 text-[var(--text-sm)]">
                  {summary.aiSummary.cons.map((con) => (
                    <li key={con} className="text-[var(--ink-soft)]">− {con}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.id} className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[var(--text-sm)] font-semibold">
                {review.authorName}
                {review.isVerified && (
                  <span className="inline-flex items-center gap-1 text-[var(--text-xs)] font-medium text-[var(--teal)]">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Verified booking
                  </span>
                )}
              </p>
              <p className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    aria-hidden
                    className={`h-3.5 w-3.5 ${i < review.rating ? 'fill-[var(--brass)] text-[var(--brass)]' : 'text-[var(--limestone)]'}`}
                  />
                ))}
              </p>
            </div>

            {review.title && <p className="text-[var(--text-base)] font-semibold">{review.title}</p>}
            {review.body && <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{review.body}</p>}

            {review.photos.length > 0 && (
              <ul className="flex gap-2">
                {review.photos.slice(0, 3).map((url) => (
                  <li key={url} className="relative h-16 w-16 overflow-hidden rounded-[var(--radius-sm)]">
                    <Image src={url} alt={`Traveller photo from ${tourTitle}`} fill sizes="64px" loading="lazy" className="object-cover" />
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
              {review.travellerType && `${review.travellerType} · `}
              {review.travelledOn ? `Travelled ${formatDate(review.travelledOn, locale)}` : formatDate(review.createdAt, locale)}
            </p>

            {review.supplierReply && (
              <blockquote className="border-s-2 border-[var(--teal)] bg-[var(--teal-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
                <p className="mb-1 text-[var(--text-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--teal-deep)]">
                  Operator response
                </p>
                {review.supplierReply}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
