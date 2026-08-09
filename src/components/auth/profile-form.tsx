'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { updateProfileAction, type AuthState } from '@/actions/auth';
import { LOCALES, LOCALE_META } from '@/lib/i18n/config';

const CURRENCIES = ['AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD', 'EUR', 'GBP', 'INR'];

export function ProfileForm({ actor }: {
  actor: { displayName: string; preferredLocale: string; preferredCurrency: string };
}) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(
    updateProfileAction, { status: 'idle' },
  );
  const err = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Full name
          <input name="fullName" defaultValue={actor.displayName} required
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal" />
          {err('fullName') && <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{err('fullName')}</span>}
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Display name
          <input name="displayName" defaultValue={actor.displayName}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal" />
          <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">
            Only your first name is ever shown on a review.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Phone
          <input name="phone" type="tel" placeholder="+971 50 123 4567"
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal" />
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Language
          <select name="preferredLocale" defaultValue={actor.preferredLocale}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal">
            {LOCALES.map((code) => (
              <option key={code} value={code}>{LOCALE_META[code].native} — {LOCALE_META[code].label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Currency
          <select name="preferredCurrency" defaultValue={actor.preferredCurrency}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal">
            {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-[var(--text-sm)]">
        <input type="checkbox" name="marketingOptIn" className="accent-[var(--teal)]" />
        Email me new experiences once a month
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'done' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save changes
      </button>
    </form>
  );
}
