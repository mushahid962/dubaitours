'use client';

import { useActionState, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { replyToReviewAction, type ReplyState } from '@/actions/reply-review';

export function ReviewReply({
  reviewId, existingReply, rating,
}: { reviewId: string; existingReply: string | null; rating: number }) {
  const [open, setOpen] = useState(false);
  const [state, submit, isPending] = useActionState<ReplyState, FormData>(
    replyToReviewAction, { status: 'idle' },
  );

  if (existingReply && state.status !== 'done') {
    return (
      <blockquote className="border-s-2 border-[var(--teal)] bg-[var(--teal-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
        <p className="mb-1 text-[var(--text-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--teal-deep)]">
          Your reply
        </p>
        {existingReply}
      </blockquote>
    );
  }

  if (state.status === 'done') {
    return <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
        <MessageSquare className="h-4 w-4" aria-hidden /> Reply publicly
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <label htmlFor={`reply-${reviewId}`} className="text-[var(--text-sm)] font-medium">
        Your reply — travellers will see this on the listing
      </label>
      <textarea id={`reply-${reviewId}`} name="reply" rows={3} required minLength={20}
        placeholder={rating <= 3
          /* The placeholder does the coaching. Operators reply to criticism
             defensively by default, and that reply is the one prospective
             travellers read most closely. */
          ? 'Thank them, acknowledge the specific problem, and say what you changed. Defending yourself here costs bookings.'
          : 'Thank them and mention something specific from their review.'}
        className="rounded-[var(--radius-md)] border border-[var(--hairline)] p-3 text-[var(--text-sm)]" />

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={isPending}
          className="flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 text-[var(--text-sm)] font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Publish reply
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="h-10 rounded-[var(--radius-pill)] px-4 text-[var(--text-sm)] text-[var(--ink-soft)]">
          Cancel
        </button>
      </div>
    </form>
  );
}
