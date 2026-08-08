'use client';

import { useActionState, useState } from 'react';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import { saveTourSeoAction, type EditorState } from '@/actions/tour-editor';
import type { Locale } from '@/lib/i18n/config';

/**
 * SEO editor with a live search-result preview.
 *
 * The preview is the point. Suppliers write meta descriptions blind and then
 * wonder why nobody clicks; showing them the actual snippet, truncated at the
 * actual pixel budget, changes what they write more than any help text.
 */
export function SeoPanel({
  tourId, locale, slug, metaTitle, metaDescription, fallbackTitle, fallbackSummary, isPublished,
}: {
  tourId: string; locale: Locale; slug: string;
  metaTitle: string | null; metaDescription: string | null;
  fallbackTitle: string; fallbackSummary: string | null; isPublished: boolean;
}) {
  const [state, submit, isPending] = useActionState<EditorState, FormData>(
    saveTourSeoAction, { status: 'idle' },
  );
  const [title, setTitle] = useState(metaTitle ?? '');
  const [description, setDescription] = useState(metaDescription ?? '');
  const [currentSlug, setCurrentSlug] = useState(slug);

  const shownTitle = title || fallbackTitle;
  const shownDescription = description || fallbackSummary || 'No description yet — Google will invent one from the page.';
  const slugChanged = currentSlug !== slug;

  return (
    <form action={submit} className="flex flex-col gap-5">
      <input type="hidden" name="tourId" value={tourId} />
      <input type="hidden" name="locale" value={locale} />

      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--limestone)] p-4">
        <p className="flex items-center gap-1.5 text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          <Search className="h-3.5 w-3.5" aria-hidden /> How this looks on Google
        </p>
        <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-[var(--paper)] p-4">
          <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">
            travelhubgulf.com › tour › {currentSlug || 'your-listing'}
          </span>
          <span className="text-[var(--text-lg)] text-[#1a0dab] dark:text-[#8ab4f8]">
            {truncate(shownTitle, 60)}
          </span>
          <span className="text-[var(--text-sm)] leading-snug text-[var(--ink-soft)]">
            {truncate(shownDescription, 160)}
          </span>
        </div>
      </section>

      <Counter
        label="Meta title" name="metaTitle" value={title} onChange={setTitle}
        max={60} hint="Google cuts off around 60 characters. Lead with what it is and where."
        placeholder={fallbackTitle}
      />

      <Counter
        label="Meta description" name="metaDescription" value={description} onChange={setDescription}
        max={160} textarea
        hint="Not a ranking factor, but it decides the click. Include the price and the cancellation policy."
        placeholder={fallbackSummary ?? ''}
      />

      <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
        URL slug
        <span className="flex items-center gap-0 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] ps-3">
          <span className="text-[var(--text-sm)] text-[var(--ink-faint)]">/tour/</span>
          <input
            name="slug" value={currentSlug} onChange={(e) => setCurrentSlug(e.target.value)}
            className="h-11 flex-1 bg-transparent pe-3 font-normal outline-none"
          />
        </span>
      </label>

      {slugChanged && isPublished && (
        /* Changing a live URL is the single most damaging thing a supplier can
           do here by accident, so the consequence is stated before they save
           rather than discovered in Search Console six weeks later. */
        <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />
          <span>
            This listing is live at the old URL. We'll add a permanent redirect so links and
            rankings carry over, but it can take Google a few weeks to catch up. Only change a
            URL when the current one is genuinely wrong.
          </span>
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save SEO
      </button>
    </form>
  );
}

function Counter({
  label, name, value, onChange, max, hint, placeholder, textarea,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  max: number; hint: string; placeholder?: string; textarea?: boolean;
}) {
  const over = value.length > max;
  const empty = value.length === 0;

  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      <span className="flex items-baseline justify-between">
        {label}
        <span className={`text-[var(--text-xs)] font-normal ${over ? 'text-[var(--pomegranate)]' : 'text-[var(--ink-faint)]'}`}>
          {value.length}/{max}{over ? ' — will be cut off' : ''}
        </span>
      </span>
      {textarea ? (
        <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} rows={3}
          placeholder={placeholder}
          className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal" />
      ) : (
        <input name={name} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal" />
      )}
      <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">
        {empty ? `Empty — we'll use the listing title. ${hint}` : hint}
      </span>
    </label>
  );
}

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
