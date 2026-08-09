'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Loader2, Eye, EyeOff, CheckCircle2, Check, X } from 'lucide-react';
import { signUpAction, resendVerificationAction, type AuthState } from '@/actions/auth';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export function SignUpForm({ locale, next }: { locale: Locale; next: string }) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(signUpAction, { status: 'idle' });
  const [resendState, resend, isResending] = useActionState<AuthState, FormData>(
    resendVerificationAction, { status: 'idle' },
  );
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  const err = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;

  /* Length first, because that is what actually resists a guess. */
  const checks = [
    { pass: password.length >= 12, label: 'At least 12 characters' },
    { pass: !/^(.)\1+$/.test(password) && password.length > 0, label: 'Not one character repeated' },
  ];

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <CheckCircle2 className="h-8 w-8 text-[var(--teal)]" aria-hidden />
        <h2 className="text-[var(--text-xl)] font-semibold text-[var(--teal-deep)]">Confirm your email</h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">{state.message}</p>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Sent to <strong>{state.email}</strong>. You cannot book or review until it is confirmed.
        </p>
        <form action={resend}>
          <input type="hidden" name="email" value={state.email} />
          <button type="submit" disabled={isResending}
            className="inline-flex items-center gap-1.5 text-[var(--text-sm)] font-semibold text-[var(--teal)] hover:underline disabled:opacity-60">
            {isResending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Send it again
          </button>
        </form>
        {resendState.status === 'sent' && (
          <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{resendState.message}</p>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-[var(--text-sm)] font-medium">I am…</legend>
        <div className="grid grid-cols-2 gap-2">
          {[['customer', 'Booking a trip'], ['business', 'Listing a business']].map(([value, label], i) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--hairline)] p-3 text-[var(--text-sm)]">
              <input type="radio" name="accountType" value={value} defaultChecked={i === 0} className="accent-[var(--teal)]" />
              {label}
            </label>
          ))}
        </div>
        {/* Business accounts still start as customers. The role only changes
            when an admin approves the application — see ACCESS-CONTROL.md. */}
        <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
          Business accounts go through licence verification before they can list.
        </p>
      </fieldset>

      <Field name="fullName" label="Full name" autoComplete="name" required error={err('fullName')} />
      <Field name="email" label="Email address" type="email" autoComplete="email" required error={err('email')} />

      <label htmlFor="password" className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
        Password
        <span className="relative flex">
          <input id="password" name="password" type={show ? 'text' : 'password'} required
            autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 pe-12 font-normal" />
          <button type="button" onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 end-0 grid w-12 place-items-center text-[var(--ink-faint)]">
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </span>
        {password.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {checks.map((check) => (
              <li key={check.label} className={`flex items-center gap-1.5 text-[var(--text-xs)] font-normal ${
                check.pass ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'
              }`}>
                {check.pass ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                {check.label}
              </li>
            ))}
          </ul>
        )}
        {err('password') && <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{err('password')}</span>}
      </label>

      <Field name="confirmPassword" label="Confirm password" type="password"
        autoComplete="new-password" required error={err('confirmPassword')} />

      <label className="flex items-start gap-2 text-[var(--text-sm)]">
        <input type="checkbox" name="acceptsTerms" required className="mt-1 accent-[var(--teal)]" />
        I accept the terms and the privacy policy.
      </label>
      {err('acceptsTerms') && <span className="text-[var(--text-xs)] text-[var(--pomegranate)]">{err('acceptsTerms')}</span>}

      <label className="flex items-start gap-2 text-[var(--text-sm)]">
        <input type="checkbox" name="marketingOptIn" className="mt-1 accent-[var(--teal)]" />
        Email me new experiences once a month.
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Create account
      </button>

      <p className="text-center text-[var(--text-sm)] text-[var(--ink-soft)]">
        Already have one?{' '}
        <Link href={`${prefix}/sign-in`} className="font-semibold text-[var(--teal)] hover:underline">Sign in</Link>
      </p>
    </form>
  );
}

function Field({ name, label, type = 'text', autoComplete, required, error }: {
  name: string; label: string; type?: string; autoComplete?: string; required?: boolean; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} required={required}
        className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      {error && <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{error}</span>}
    </label>
  );
}
