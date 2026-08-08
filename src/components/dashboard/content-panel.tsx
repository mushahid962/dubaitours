'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { saveTourContentAction, type EditorState } from '@/actions/tour-editor';
import type { Locale } from '@/lib/i18n/config';

export function ContentPanel({
  tourId, locale, translation,
}: { tourId: string; locale: Locale; translation: Record<string, any> | null }) {
  const [state, submit, isPending] = useActionState<EditorState, FormData>(
    saveTourContentAction, { status: 'idle' },
  );
  const error = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;
  const lines = (value: unknown) => Array.isArray(value) ? value.join('\n') : '';

  return (
    <form action={submit} className="flex flex-col gap-5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
      <input type="hidden" name="tourId" value={tourId} />
      <input type="hidden" name="locale" value={locale} />

      <Field name="title" label="Title" defaultValue={translation?.title ?? ''} error={error('title')}
        hint="What it is, where, and what makes it different. This is the headline in search results."
        placeholder="Dubai Evening Desert Safari with BBQ Dinner & Live Shows" />

      <Field name="summary" label="One-line summary" defaultValue={translation?.summary ?? ''} error={error('summary')}
        hint="Shown on cards and used as the fallback meta description." />

      <Area name="description" label="Full description" rows={10} defaultValue={translation?.description ?? ''}
        error={error('description')}
        hint="At least 300 characters. Write for a traveller deciding, not for a search engine — describe the day in order, and be specific about what they'll actually see." />

      <Area name="highlights" label="Highlights (one per line)" rows={5} defaultValue={lines(translation?.highlights)}
        error={error('highlights')} hint="Three minimum. These become the bullet list near the top of the page." />

      <div className="grid gap-5 sm:grid-cols-2">
        <Area name="inclusions" label="What's included (one per line)" rows={5}
          defaultValue={lines(translation?.inclusions)} error={error('inclusions')} hint="" />
        <Area name="exclusions" label="What's not included (one per line)" rows={5}
          defaultValue={lines(translation?.exclusions)} error={error('exclusions')}
          hint="Being explicit here prevents most refund disputes." />
      </div>

      <Area name="whatToBring" label="What to bring (one per line)" rows={3}
        defaultValue={lines(translation?.what_to_bring)} error={error('whatToBring')} hint="" />

      <Area name="knowBeforeYouGo" label="Know before you go" rows={4}
        defaultValue={translation?.know_before_you_go ?? ''} error={error('knowBeforeYouGo')}
        hint="Restrictions, fitness level, dress code, anything that could ruin someone's day if they turn up unaware." />

      <Area name="meetingInstructions" label="Meeting instructions" rows={3}
        defaultValue={translation?.meeting_instructions ?? ''} error={error('meetingInstructions')}
        hint="Exactly where to stand, and what your guide will be holding or wearing." />

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save content
      </button>
    </form>
  );
}

function Field({ name, label, defaultValue, hint, error, placeholder }: {
  name: string; label: string; defaultValue: string; hint: string; error?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <input name={name} defaultValue={defaultValue} placeholder={placeholder}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      <Hint hint={hint} error={error} />
    </label>
  );
}

function Area({ name, label, rows, defaultValue, hint, error }: {
  name: string; label: string; rows: number; defaultValue: string; hint: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <textarea name={name} rows={rows} defaultValue={defaultValue}
        className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      <Hint hint={hint} error={error} />
    </label>
  );
}

const Hint = ({ hint, error }: { hint: string; error?: string }) =>
  error ? <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{error}</span>
        : hint ? <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">{hint}</span>
        : null;
