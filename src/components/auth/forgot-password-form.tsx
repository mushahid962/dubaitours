'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { forgotPasswordAction, type AuthState } from '@/actions/auth';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(
    forgotPasswordAction, { status: 'idle' },
  );
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <CheckCircle2 className="h-8 w-8 text-[var(--teal)]" aria-hidden />
        <h2 className="text-[var(--text-xl)] font-semibold text-[var(--teal-deep)]">Check your email</h2>
        {/* Phrased so it reveals nothing about whether the account exists. */}
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">{state.message}</p>
        <Link href={`${prefix}/sign-in`} className="text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <label htmlFor="email" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
        Email address
        <input id="email" name="email" type="email" required autoComplete="email"
          className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal" />
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
        Send reset link
      </button>

      <Link href={`${prefix}/sign-in`} className="text-center text-[var(--text-sm)] text-[var(--ink-soft)] hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
