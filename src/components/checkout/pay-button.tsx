'use client';

import { useActionState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { startPaymentAction, type PaymentState } from '@/actions/start-payment';
import type { Locale } from '@/lib/i18n/config';

export function PayButton({
  reference, locale, amountLabel,
}: { reference: string; locale: Locale; amountLabel: string }) {
  const [state, submit, isPending] = useActionState<PaymentState, FormData>(
    startPaymentAction,
    { status: 'idle' },
  );

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />

      {state.status === 'error' && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_12%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 py-4 text-[var(--text-lg)] font-semibold text-white transition-colors hover:bg-[var(--teal-deep)] disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Taking you to Stripe…
          </>
        ) : (
          <>
            <ShieldCheck className="h-5 w-5" aria-hidden />
            Pay {amountLabel}
          </>
        )}
      </button>
    </form>
  );
}
