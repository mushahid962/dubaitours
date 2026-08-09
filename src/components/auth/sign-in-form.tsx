'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { signInAction, signInWithProviderAction, type AuthState } from '@/actions/auth';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export function SignInForm({ locale, next }: { locale: Locale; next: string }) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(signInAction, { status: 'idle' });
  const [showPassword, setShowPassword] = useState(false);
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  return (
    <div className="flex flex-col gap-4">
      <form action={submit} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />

        <label htmlFor="email" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
          Email address
          <input id="email" name="email" type="email" required autoComplete="email"
            className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal" />
        </label>

        <label htmlFor="password" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
          <span className="flex items-baseline justify-between">
            Password
            <Link href={`${prefix}/forgot-password`} className="text-[var(--text-xs)] font-normal text-[var(--teal)] hover:underline">
              Forgot it?
            </Link>
          </span>
          <span className="relative flex">
            <input id="password" name="password" type={showPassword ? 'text' : 'password'}
              required autoComplete="current-password"
              className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 pe-12 font-normal" />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 end-0 grid w-12 place-items-center text-[var(--ink-faint)]">
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </span>
        </label>

        {state.status === 'error' && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.message}
          </p>
        )}

        <button type="submit" disabled={isPending}
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Sign in
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
            <button type="submit"
              className="h-12 w-full rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--paper)] text-[var(--text-sm)] font-semibold capitalize">
              Continue with {provider}
            </button>
          </form>
        ))}
      </div>

      <p className="text-center text-[var(--text-sm)] text-[var(--ink-soft)]">
        No account?{' '}
        <Link href={`${prefix}/sign-up`} className="font-semibold text-[var(--teal)] hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
