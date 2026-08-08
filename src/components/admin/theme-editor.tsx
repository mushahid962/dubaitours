'use client';

import { useActionState, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { saveThemeAction, type ContentState } from '@/actions/content-editor';

const SWATCHES = [
  { name: 'primary', label: 'Primary', use: 'Buttons, links, anything the visitor should click' },
  { name: 'accent', label: 'Accent', use: 'Featured badges, verification, star ratings' },
  { name: 'urgent', label: 'Urgent', use: 'Deals and low availability only — overuse kills it' },
  { name: 'ink', label: 'Text', use: 'Body copy and headings' },
  { name: 'surface', label: 'Background', use: 'Page background behind the cards' },
] as const;

export function ThemeEditor({
  theme, customCss,
}: { theme: Record<string, string>; customCss: string }) {
  const [values, setValues] = useState(theme);
  const [state, submit, isPending] = useActionState<ContentState, FormData>(
    saveThemeAction, { status: 'idle' },
  );

  return (
    <form action={submit} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SWATCHES.map((swatch) => (
          <label key={swatch.name} className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4 text-[var(--text-sm)] font-medium">
            {swatch.label}
            <span className="flex items-center gap-2">
              <input type="color" value={values[swatch.name]}
                onChange={(e) => setValues({ ...values, [swatch.name]: e.target.value })}
                aria-label={`${swatch.label} colour`}
                className="h-10 w-14 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--hairline)]" />
              <input name={swatch.name} value={values[swatch.name]}
                onChange={(e) => setValues({ ...values, [swatch.name]: e.target.value })}
                className="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] font-normal uppercase" />
            </span>
            <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">{swatch.use}</span>
          </label>
        ))}

        <label className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4 text-[var(--text-sm)] font-medium">
          Corner radius
          <input name="radius" value={values.radius}
            onChange={(e) => setValues({ ...values, radius: e.target.value })}
            className="h-10 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal" />
          <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">
            e.g. 22px. Lower reads sharper and more corporate; higher reads softer.
          </span>
        </label>
      </div>

      {/* Preview uses the live values, so a bad contrast choice is visible
          before it ships rather than after. */}
      <section aria-label="Preview" className="flex flex-col gap-3 rounded-[var(--radius-lg)] p-6"
        style={{ background: values.surface, borderRadius: values.radius }}>
        <p className="text-[var(--text-xs)] uppercase tracking-[0.06em]" style={{ color: values.ink, opacity: 0.55 }}>
          Preview
        </p>
        <h3 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]" style={{ color: values.ink }}>
          Dubai Evening Desert Safari
        </h3>
        <p className="text-[var(--text-sm)]" style={{ color: values.ink, opacity: 0.75 }}>
          Six hours in the Lahbab dunes with dinner and live shows.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
            style={{ background: values.primary, borderRadius: '999px' }}>
            Book from AED 149
          </span>
          <span className="px-3 py-1 text-[var(--text-xs)] font-semibold"
            style={{ background: `${values.accent}22`, color: values.accent, borderRadius: '999px' }}>
            Verified operator
          </span>
          <span className="px-3 py-1 text-[var(--text-xs)] font-bold text-white"
            style={{ background: values.urgent, borderRadius: '999px' }}>
            −40%
          </span>
        </div>
      </section>

      <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
        Site-wide custom CSS
        <textarea name="customCss" defaultValue={customCss} rows={10}
          className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] font-normal" />
        <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">
          Injected on every page. Script tags, javascript: URLs, expression() and @import are
          rejected on save.
        </span>
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save theme
      </button>
    </form>
  );
}
