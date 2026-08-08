'use client';

import { useActionState } from 'react';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { subscribeAction, type SubscribeState } from '@/actions/newsletter';
import type { Locale } from '@/lib/i18n/config';

export function NewsletterForm({ locale }: { locale: Locale }) {
  const [state, submit, isPending] = useActionState<SubscribeState, FormData>(
    subscribeAction,
    { status: 'idle' },
  );

  if (state.status === 'done') {
    return (
      <p className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--teal-wash)] p-4 text-[var(--text-sm)] text-[var(--teal-deep)]">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form action={submit} className="flex w-full max-w-md flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">Email address</label>
        <input
          id="newsletter-email" name="email" type="email" required autoComplete="email"
          placeholder="you@example.com"
          className="h-12 flex-1 rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] px-5 text-[var(--text-base)]"
        />
        <button
          type="submit" disabled={isPending}
          className="flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Subscribe
        </button>
      </div>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
        One email a month. We send a confirmation link first, and unsubscribe is one click.
      </p>
    </form>
  );
}
