'use client';

import { useActionState } from 'react';
import { Loader2, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react';
import { redeemTicketAction, type RedeemState } from '@/actions/redeem-ticket';

/**
 * Check-in at the meeting point.
 *
 * A text field rather than a camera scanner on purpose: guides work in bright
 * sun with sandy phones, and typing eight characters always works. A camera
 * scanner can come later as an enhancement, not as the only way in.
 */
export function CheckInScanner() {
  const [state, submit, isPending] = useActionState<RedeemState, FormData>(
    redeemTicketAction, { status: 'idle' },
  );

  return (
    <section aria-labelledby="check-in" className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <h2 id="check-in" className="flex items-center gap-2 text-[var(--text-lg)] font-semibold">
        <ScanLine className="h-5 w-5 text-[var(--teal)]" aria-hidden /> Check a traveller in
      </h2>

      <form action={submit} className="flex gap-2">
        <label htmlFor="ticket" className="sr-only">Ticket code</label>
        <input
          id="ticket" name="ticketCode" required autoComplete="off" spellCheck={false}
          placeholder="Paste or type the ticket code"
          className="h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-[family-name:var(--font-mono)]"
        />
        <button type="submit" disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Check in
        </button>
      </form>

      {state.status === 'checked_in' && (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--teal-wash)] p-3 text-[var(--text-sm)] text-[var(--teal-deep)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>{state.guestName}</strong> · {state.seats} {state.seats === 1 ? 'traveller' : 'travellers'} · {state.reference}
            {state.alreadyRedeemed && (
              /* Not an error. Guides scan twice constantly, and the original
                 time is what matters if there is ever a dispute. */
              <span className="block text-[var(--ink-soft)]">
                Already checked in at {new Date(state.redeemedAt).toLocaleTimeString()}.
              </span>
            )}
          </span>
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.message}
        </p>
      )}
    </section>
  );
}
