'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, Check, X } from 'lucide-react';
import { resetPasswordAction, type AuthState } from '@/actions/auth';

export function ResetPasswordForm() {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(
    resetPasswordAction, { status: 'idle' },
  );
  const [password, setPassword] = useState('');

  if (state.status === 'done') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <CheckCircle2 className="h-8 w-8 text-[var(--teal)]" aria-hidden />
        <h2 className="text-[var(--text-xl)] font-semibold text-[var(--teal-deep)]">{state.message}</h2>
        <Link href="/account"
          className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
          Go to your account
        </Link>
      </div>
    );
  }

  const longEnough = password.length >= 12;

  return (
    <form action={submit} className="flex flex-col gap-3">
      <label htmlFor="password" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
        New password
        <input id="password" name="password" type="password" required autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal" />
        {password.length > 0 && (
          <span className={`flex items-center gap-1.5 text-[var(--text-xs)] font-normal ${
            longEnough ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'}`}>
            {longEnough ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
            At least 12 characters
          </span>
        )}
      </label>

      <label htmlFor="confirmPassword" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
        Confirm new password
        <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password"
          className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal" />
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">
          {state.message}
          {state.fieldErrors?.password?.[0] && ` ${state.fieldErrors.password[0]}`}
          {state.fieldErrors?.confirmPassword?.[0] && ` ${state.fieldErrors.confirmPassword[0]}`}
        </p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Update password
      </button>
    </form>
  );
}
