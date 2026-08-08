'use client';

import { useActionState, useState } from 'react';
import { Loader2, CalendarPlus } from 'lucide-react';
import { generateAvailabilityAction, type EditorState } from '@/actions/tour-editor';

const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

/**
 * Bulk availability. Filling a calendar one day at a time is the task that
 * makes suppliers abandon a marketplace, so this generates a date range in
 * one submit and is safe to re-run — existing dates with bookings are left
 * untouched.
 */
export function AvailabilityPanel({ options }: { options: Array<{ id: string; name: string }> }) {
  const [state, submit, isPending] = useActionState<EditorState, FormData>(
    generateAvailabilityAction, { status: 'idle' },
  );
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  if (!options.length) {
    return (
      <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
        Add a bookable option under Pricing first — availability is set per option, because a
        private vehicle and a shared seat sell out independently.
      </p>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  return (
    <form action={submit} className="flex flex-col gap-5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
      {days.map((day) => <input key={day} type="hidden" name="weekdays" value={day} />)}

      <div className="flex flex-col gap-1">
        <h3 className="text-[var(--text-lg)] font-semibold">Add dates in bulk</h3>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Generate a whole season at once. Running this again over dates you've already added
          changes nothing — existing bookings are never touched.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
        Option
        <select name="optionId" required
          className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal">
          {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input name="from" label="From" type="date" defaultValue={today} />
        <Input name="to" label="To" type="date" defaultValue={in90} />
        <Input name="time" label="Start time" type="time" defaultValue="16:00" />
        <Input name="capacity" label="Seats per date" type="number" defaultValue="20" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[var(--text-sm)] font-medium">Which days do you run?</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const on = days.includes(day.value);
            return (
              <button key={day.value} type="button"
                onClick={() => setDays((current) =>
                  on ? current.filter((d) => d !== day.value) : [...current, day.value])}
                aria-pressed={on}
                className={`rounded-[var(--radius-pill)] border px-4 py-1.5 text-[var(--text-sm)] ${
                  on ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]'
                     : 'border-[var(--hairline)] text-[var(--ink-soft)]'
                }`}>
                {day.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending || days.length === 0}
        className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
        Generate dates
      </button>
    </form>
  );
}

function Input({ name, label, type, defaultValue }: {
  name: string; label: string; type: string; defaultValue: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} required
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal" />
    </label>
  );
}
