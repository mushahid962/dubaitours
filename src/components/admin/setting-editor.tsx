'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { saveSettingAction, type ContentState } from '@/actions/content-editor';

/**
 * Raw JSON editor for a settings row. Deliberately plain: these are
 * infrequent, technical settings, and a bespoke form per key would be more
 * code to maintain than value delivered.
 */
export function SettingEditor({
  settingKey, title, description, value,
}: { settingKey: string; title: string; description: string; value: unknown }) {
  const [state, submit, isPending] = useActionState<ContentState, FormData>(
    saveSettingAction, { status: 'idle' },
  );

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex flex-col gap-1">
        <h2 className="text-[var(--text-lg)] font-semibold">{title}</h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">{description}</p>
      </div>

      <label className="sr-only" htmlFor={`setting-${settingKey}`}>{title} JSON</label>
      <textarea id={`setting-${settingKey}`} name="value" rows={6}
        defaultValue={JSON.stringify(value, null, 2)}
        className="rounded-[var(--radius-md)] border border-[var(--hairline)] p-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)]" />

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-10 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 text-[var(--text-sm)] font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save
      </button>
    </form>
  );
}
