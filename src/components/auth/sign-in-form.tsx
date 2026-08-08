'use client';

import { useActionState } from 'react';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { signInWithEmailAction, signInWithProviderAction, type AuthState } from '@/actions/auth';
import type { Locale } from '@/lib/i18n/config';

export function SignInForm({ locale, next }: { locale: Locale; next: string }) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(
    signInWithEmailAction,
    { status: 'idle' },
  );

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <CheckCircle2 className="h-8 w-8 text-[var(--teal)]" aria-hidden />
        <h2 className="text-[var(--text-xl)] font-semibold">Check your email</h2>
        {/* Worded so it reveals nothing about whether the account exists —
            a message that differs by account turns this form into an
            email-enumeration tool. */}
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          If <strong>{state.email}</strong> can sign in, a link is on its way. It expires in
          an hour. Check spam if it hasn't arrived in a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={submit} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
          Email address
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 text-[var(--text-base)] font-normal"
          />
        </label>

        {state.status === 'error' && (
          <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
        )}

        <button
          type="submit" disabled={isPending}
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
          Email me a sign-in link
        </button>
      </form>

      <p className="flex items-center gap-3 text-[var(--text-xs)] text-[var(--ink-faint)]">
        <span className="h-px flex-1 bg-[var(--hairline)]" aria-hidden /> or <span className="h-px flex-1 bg-[var(--hairline)]" aria-hidden />
      </p>

      <div className="flex gap-2">
        {(['google', 'apple'] as const).map((provider) => (
          <form key={provider} action={signInWithProviderAction} className="flex-1">
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="h-12 w-full rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] text-[var(--text-sm)] font-semibold capitalize"
            >
              Continue with {provider}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
