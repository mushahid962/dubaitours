'use client';

import { useActionState, useState } from 'react';
import { Loader2, BadgeCheck, ImageIcon } from 'lucide-react';
import { reviewTourAction, type TourReviewState } from '@/actions/review-tour';

export type TourForReview = {
  id: string; title: string; slug: string; description: string; highlights: string[];
  metaDescription: string | null; operatorName: string; operatorSlug: string;
  verification: string; completeness: number; photoCount: number;
  price: string; duration: string; cancellation: string; submittedAt: string;
};

export function TourReviewCard({ tour }: { tour: TourForReview }) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [state, submit, isPending] = useActionState<TourReviewState, FormData>(
    reviewTourAction, { status: 'idle' },
  );

  if (state.status === 'done') {
    return (
      <p className="rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-4 text-[var(--text-sm)] text-[var(--teal-deep)]">
        {state.message}
      </p>
    );
  }

  // Things a reviewer would otherwise have to notice by reading carefully.
  const flags = [
    tour.photoCount < 3 && `Only ${tour.photoCount} photo${tour.photoCount === 1 ? '' : 's'}`,
    tour.description.length < 500 && 'Short description — likely thin for search',
    !tour.metaDescription && 'No meta description',
    tour.highlights.length < 3 && 'Fewer than three highlights',
    tour.verification === 'none' && 'Operator licence not yet verified',
  ].filter(Boolean) as string[];

  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[var(--text-xl)] font-semibold">{tour.title}</h2>
          <p className="flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--ink-soft)]">
            {tour.operatorName}
            {tour.verification !== 'none' && <BadgeCheck className="h-4 w-4 text-[var(--brass)]" aria-label="Verified operator" />}
            · submitted {tour.submittedAt}
          </p>
        </div>
        <dl className="flex gap-4 text-[var(--text-xs)]">
          {[['Price', tour.price], ['Duration', tour.duration], ['Cancellation', tour.cancellation],
            ['Photos', String(tour.photoCount)], ['Complete', `${tour.completeness}%`]].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[var(--ink-faint)]">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <p className="max-h-32 overflow-y-auto text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">
        {tour.description.slice(0, 900)}{tour.description.length > 900 && '…'}
      </p>

      {flags.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-xs)] text-[var(--ink-soft)]">
          <ImageIcon className="h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />
          Check before approving: {flags.join(' · ')}
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      {decision === null ? (
        <div className="flex gap-2 border-t border-[var(--hairline)] pt-4">
          <button type="button" onClick={() => setDecision('approve')}
            className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2 text-[var(--text-sm)] font-semibold text-white">
            Approve and publish
          </button>
          <button type="button" onClick={() => setDecision('reject')}
            className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2 text-[var(--text-sm)] font-semibold text-[var(--pomegranate)]">
            Send back
          </button>
        </div>
      ) : (
        <form action={submit} className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-4">
          <input type="hidden" name="tourId" value={tour.id} />
          <input type="hidden" name="decision" value={decision} />

          <label className="flex flex-col gap-1 text-[var(--text-sm)]">
            {decision === 'approve' ? 'Internal note (optional)' : 'What needs fixing? The operator sees this.'}
            <textarea
              name={decision === 'approve' ? 'note' : 'reason'} rows={3}
              required={decision === 'reject'} minLength={decision === 'reject' ? 15 : undefined}
              placeholder={decision === 'approve'
                ? 'Licence checked, photos are the operator’s own.'
                : 'Photo 3 is a stock image of a different desert. Replace it with your own, and add the pickup window to Know Before You Go.'}
              className="rounded-[var(--radius-md)] border border-[var(--hairline)] p-3" />
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={isPending}
              className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2 text-[var(--text-sm)] font-semibold text-white disabled:opacity-60">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {decision === 'approve' ? 'Publish listing' : 'Send back to operator'}
            </button>
            <button type="button" onClick={() => setDecision(null)}
              className="rounded-[var(--radius-pill)] px-4 py-2 text-[var(--text-sm)] text-[var(--ink-soft)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
