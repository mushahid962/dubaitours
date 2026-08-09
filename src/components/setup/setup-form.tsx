'use client';

import { useActionState, useState } from 'react';
import { Loader2, Eye, EyeOff, Check, X } from 'lucide-react';
import { completeSetupAction, type SetupState } from '@/actions/setup';
import type { Locale } from '@/lib/i18n/config';

export function SetupForm({ locale, tokenRequired }: { locale: Locale; tokenRequired: boolean }) {
  const [state, submit, isPending] = useActionState<SetupState, FormData>(
    completeSetupAction, { status: 'idle' },
  );
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const err = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;
  const longEnough = password.length >= 12;

  return (
    <form action={submit} className="flex flex-col gap-4">
      <Field name="fullName" label="Your name" autoComplete="name" required error={err('fullName')} />
      <Field name="email" label="Email address" type="email" autoComplete="email" required
        error={err('email')} hint="You will sign in with this." />

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
          <span className={`flex items-center gap-1.5 text-[var(--text-xs)] font-normal ${
            longEnough ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'}`}>
            {longEnough ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
            At least 12 characters
          </span>
        )}
        {/* This account can refund any booking and read every traveller's
            details. Worth one sentence of pressure at the point of choosing. */}
        <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">
          This is the most privileged account on the platform. Use a password manager.
        </span>
        {err('password') && <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{err('password')}</span>}
      </label>

      <Field name="confirmPassword" label="Confirm password" type="password"
        autoComplete="new-password" required error={err('confirmPassword')} />

      {tokenRequired && (
        <Field name="token" label="Setup token" required error={err('token')}
          hint="The SETUP_TOKEN you set in your environment variables." />
      )}

      {state.status === 'error' && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Create admin account
      </button>

      <p className="text-center text-[var(--text-xs)] text-[var(--ink-faint)]">
        Your email is confirmed automatically, so you can sign in straight away.
      </p>
    </form>
  );
}

function Field({ name, label, type = 'text', autoComplete, required, hint, error }: {
  name: string; label: string; type?: string; autoComplete?: string;
  required?: boolean; hint?: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[var(--text-sm)] font-medium">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} required={required}
        className="h-12 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-4 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      {error ? <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{error}</span>
        : hint ? <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">{hint}</span> : null}
    </label>
  );
}
