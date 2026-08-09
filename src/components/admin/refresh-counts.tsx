'use client';

import { useActionState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { refreshLocationCountsAction, type LocationState } from '@/actions/location-admin';

/**
 * Listing counts drive indexation, and they go stale as inventory changes.
 * A cron job refreshes them nightly; this is the manual pull for when an
 * editor wants to see the effect of a change immediately.
 */
export function RefreshCounts() {
  const [state, run, isPending] = useActionState<LocationState, FormData>(
    async () => refreshLocationCountsAction(), { status: 'idle' },
  );

  return (
    <form action={run} className="flex items-center gap-2">
      <button type="submit" disabled={isPending}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 text-[var(--text-sm)] font-semibold disabled:opacity-60">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        Recount
      </button>
      {state.status === 'saved' && (
        <span role="status" className="text-[var(--text-xs)] text-[var(--teal)]">{state.message}</span>
      )}
      {state.status === 'error' && (
        <span role="alert" className="text-[var(--text-xs)] text-[var(--pomegranate)]">{state.message}</span>
      )}
    </form>
  );
}
