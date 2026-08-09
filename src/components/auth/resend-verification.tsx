'use client';

import { useActionState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { resendVerificationAction, type AuthState } from '@/actions/auth';

export function ResendVerification({ email }: { email: string }) {
  const [state, submit, isPending] = useActionState<AuthState, FormData>(
    resendVerificationAction, { status: 'idle' },
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={submit}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 font-semibold text-white disabled:opacity-60">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Send the link again
        </button>
      </form>
      {state.status === 'sent' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
    </div>
  );
}
