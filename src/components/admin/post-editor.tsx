'use client';

import { useActionState, useState } from 'react';
import { Loader2, Search, Code2, Palette, CalendarClock, FileText, AlertTriangle, Check } from 'lucide-react';
import { savePostAction, type ContentState } from '@/actions/content-editor';
import type { Locale } from '@/lib/i18n/config';

type Option = { id: string; name: string };
export type PostDraft = {
  id?: string; title: string; slug: string; excerpt: string; bodyMdx: string;
  postType: string; authorId: string; reviewerId: string | null;
  cityId: string | null; countryId: string | null; coverMediaId: string | null;
  tags: string; metaTitle: string; metaDescription: string; focusKeyword: string;
  canonicalUrl: string; robots: string; ogTitle: string; ogDescription: string;
  customSchema: string; customCss: string; customHead: string;
  status: string; scheduledFor: string; isFeatured: boolean;
};

const TABS = [
  { key: 'content', label: 'Content', icon: FileText },
  { key: 'seo', label: 'SEO', icon: Search },
  { key: 'schema', label: 'Schema', icon: Code2 },
  { key: 'design', label: 'Design', icon: Palette },
  { key: 'publish', label: 'Publishing', icon: CalendarClock },
] as const;

export function PostEditor({
  locale, draft, authors, cities, countries,
}: {
  locale: Locale; draft: PostDraft;
  authors: Option[]; cities: Option[]; countries: Option[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('content');
  const [state, submit, isPending] = useActionState<ContentState, FormData>(
    savePostAction, { status: 'idle' },
  );

  const [title, setTitle] = useState(draft.title);
  const [slug, setSlug] = useState(draft.slug);
  const [metaTitle, setMetaTitle] = useState(draft.metaTitle);
  const [metaDescription, setMetaDescription] = useState(draft.metaDescription);
  const [body, setBody] = useState(draft.bodyMdx);
  const [focusKeyword, setFocusKeyword] = useState(draft.focusKeyword);
  const [status, setStatus] = useState(draft.status);

  const err = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  /**
   * Live SEO checks. Deliberately advisory rather than blocking — a writer
   * who is told "you cannot save" over a keyword count stops using the CMS.
   */
  const checks = focusKeyword ? [
    { pass: title.toLowerCase().includes(focusKeyword.toLowerCase()), label: 'Keyword in the title' },
    { pass: slug.includes(focusKeyword.toLowerCase().replace(/\s+/g, '-')), label: 'Keyword in the URL' },
    { pass: metaDescription.toLowerCase().includes(focusKeyword.toLowerCase()), label: 'Keyword in the meta description' },
    { pass: body.toLowerCase().includes(focusKeyword.toLowerCase()), label: 'Keyword in the body' },
    { pass: words >= 600, label: `At least 600 words (${words} now)` },
  ] : [];

  return (
    <form action={submit} className="flex flex-col gap-5">
      {draft.id && <input type="hidden" name="postId" value={draft.id} />}
      <input type="hidden" name="locale" value={locale} />
      {/* Fields on hidden tabs must still submit, so every panel stays mounted
          and is hidden with CSS rather than unmounted. */}

      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]">
        {TABS.map((item) => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-[var(--text-sm)] font-medium ${
              tab === item.key ? 'border-[var(--teal)] text-[var(--teal)]'
                               : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}>
            <item.icon className="h-4 w-4" aria-hidden /> {item.label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------------- content */}
      <Panel show={tab === 'content'}>
        <Field label="Title" name="title" value={title} onChange={setTitle} error={err('title')}
          hint="Written for a reader first. The search-result version is on the SEO tab." />

        <Field label="URL slug" name="slug" value={slug} onChange={setSlug} error={err('slug')}
          prefix="/travel-guide/" hint="Lowercase words with hyphens. Changing this on a live post creates a redirect automatically." />

        <Area label="Excerpt" name="excerpt" defaultValue={draft.excerpt} rows={2} error={err('excerpt')}
          hint="Shown on cards and used as the meta description if you leave that blank." />

        <Area label="Body (Markdown)" name="bodyMdx" value={body} onChange={setBody} rows={18}
          error={err('bodyMdx')} hint={`${words} words · about ${Math.max(1, Math.round(words / 220))} min read`} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" name="postType" defaultValue={draft.postType} error={err('postType')}
            options={['guide', 'listicle', 'news', 'itinerary', 'food', 'culture', 'visa', 'event', 'review']
              .map((v) => ({ id: v, name: v }))} />
          <Select label="Author" name="authorId" defaultValue={draft.authorId} error={err('authorId')}
            options={authors} hint="Bylines are an E-E-A-T signal, not decoration." />
          <Select label="Reviewed by" name="reviewerId" defaultValue={draft.reviewerId ?? ''}
            options={authors} allowEmpty hint="A named reviewer strengthens the page's credibility." />
          <Select label="City" name="cityId" defaultValue={draft.cityId ?? ''} options={cities} allowEmpty />
          <Select label="Country" name="countryId" defaultValue={draft.countryId ?? ''} options={countries} allowEmpty />
          <Field label="Tags (comma separated)" name="tags" defaultValue={draft.tags} />
        </div>

        <Field label="Featured image — media ID" name="coverMediaId" defaultValue={draft.coverMediaId ?? ''}
          hint="Paste an ID from the media library. A picker lands with the media library section." />
      </Panel>

      {/* ----------------------------------------------------------- seo */}
      <Panel show={tab === 'seo'}>
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--limestone)] p-4">
          <p className="text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            How this looks on Google
          </p>
          <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-[var(--paper)] p-4">
            <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">
              travelhubgulf.com › travel-guide › {slug || 'your-post'}
            </span>
            <span className="text-[var(--text-lg)] text-[#1a0dab]">{cut(metaTitle || title, 60)}</span>
            <span className="text-[var(--text-sm)] leading-snug text-[var(--ink-soft)]">
              {cut(metaDescription || draft.excerpt || 'No description — Google will invent one from the page.', 160)}
            </span>
          </div>
        </section>

        <Field label="Focus keyword" name="focusKeyword" value={focusKeyword} onChange={setFocusKeyword}
          hint="What this page should rank for. Used only for the checks below — it is never sent to Google." />

        {checks.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--paper)] p-4">
            {checks.map((check) => (
              <li key={check.label} className={`flex items-center gap-2 text-[var(--text-sm)] ${
                check.pass ? 'text-[var(--teal)]' : 'text-[var(--ink-soft)]'
              }`}>
                {check.pass
                  ? <Check className="h-4 w-4 shrink-0" aria-hidden />
                  : <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />}
                {check.label}
              </li>
            ))}
          </ul>
        )}

        <Counted label="Meta title" name="metaTitle" value={metaTitle} onChange={setMetaTitle}
          max={60} placeholder={title} hint="Blank falls back to the post title." />
        <Counted label="Meta description" name="metaDescription" value={metaDescription}
          onChange={setMetaDescription} max={160} textarea
          hint="Not a ranking factor, but it decides the click." />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canonical URL" name="canonicalUrl" defaultValue={draft.canonicalUrl} error={err('canonicalUrl')}
            hint="Only set this if the same content lives elsewhere and that copy should rank." />
          <Select label="Robots" name="robots" defaultValue={draft.robots}
            options={['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'].map((v) => ({ id: v, name: v }))}
            hint="noindex keeps a page out of Google while still passing link value." />
          <Field label="Social title" name="ogTitle" defaultValue={draft.ogTitle}
            hint="Used when shared on WhatsApp, X or LinkedIn." />
          <Field label="Social description" name="ogDescription" defaultValue={draft.ogDescription} />
        </div>
      </Panel>

      {/* -------------------------------------------------------- schema */}
      <Panel show={tab === 'schema'}>
        <p className="rounded-[var(--radius-md)] bg-[var(--teal-wash)] p-3 text-[var(--text-sm)] text-[var(--teal-deep)]">
          Article, author, breadcrumb and organisation schema are generated automatically for every
          post. Add JSON-LD here only for something extra — a Recipe, an Event, a HowTo.
        </p>
        <Area label="Custom JSON-LD" name="customSchema" defaultValue={draft.customSchema} rows={12}
          error={err('customSchema')} mono
          hint='One object or an array. Each needs an "@type". Malformed JSON is rejected on save — broken structured data is worse than none.' />
        <Area label="Extra <head> markup" name="customHead" defaultValue={draft.customHead} rows={4}
          error={err('customHead')} mono
          hint="Meta tags and verification codes for this post only. Site-wide tags belong in Header Scripts." />
      </Panel>

      {/* -------------------------------------------------------- design */}
      <Panel show={tab === 'design'}>
        <Area label="Custom CSS for this post" name="customCss" defaultValue={draft.customCss} rows={14}
          error={err('customCss')} mono
          hint="Scoped to this page. Use the site theme first — per-page CSS is how a site slowly stops looking like one site." />
        <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
          Rejected on save: script tags, javascript: URLs, expression(), and @import.
        </p>
      </Panel>

      {/* ------------------------------------------------------- publish */}
      <Panel show={tab === 'publish'}>
        <Select label="Status" name="status" value={status} onChange={setStatus} error={err('status')}
          options={[
            { id: 'draft', name: 'Draft — only visible here' },
            { id: 'scheduled', name: 'Scheduled — goes live automatically' },
            { id: 'published', name: 'Published — live now' },
            { id: 'archived', name: 'Archived — removed from the site' },
          ]} />

        {status === 'scheduled' && (
          <Field label="Publish at" name="scheduledFor" type="datetime-local"
            defaultValue={draft.scheduledFor} error={err('scheduledFor')}
            hint="Published by a database job, so it works whether or not anyone is online." />
        )}

        <label className="flex items-center gap-2 text-[var(--text-sm)]">
          <input type="checkbox" name="isFeatured" defaultChecked={draft.isFeatured} className="accent-[var(--teal)]" />
          Feature this post on the travel guide index
        </label>
      </Panel>

      {state.status === 'error' && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
          {state.message}
        </p>
      )}
      {state.status === 'saved' && (
        <p role="status" className="rounded-[var(--radius-md)] bg-[var(--teal-wash)] p-3 text-[var(--text-sm)] text-[var(--teal-deep)]">
          {state.message}
        </p>
      )}

      <div className="sticky bottom-0 flex gap-3 border-t border-[var(--hairline)] bg-[var(--salt)] py-3">
        <button type="submit" disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save
        </button>
        <span className="self-center text-[var(--text-xs)] text-[var(--ink-faint)]">
          Saves every tab, not just the one you're looking at.
        </span>
      </div>
    </form>
  );
}

const Panel = ({ show, children }: { show: boolean; children: React.ReactNode }) => (
  <div className={show ? 'flex flex-col gap-5' : 'hidden'}>{children}</div>
);

function Field({ label, name, value, onChange, defaultValue, hint, error, prefix, type = 'text' }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; hint?: string; error?: string; prefix?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <span className="flex items-center rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] ps-3"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined}>
        {prefix && <span className="text-[var(--text-sm)] text-[var(--ink-faint)]">{prefix}</span>}
        <input name={name} type={type}
          {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
          className="h-11 flex-1 bg-transparent pe-3 font-normal outline-none" />
      </span>
      <Hint hint={hint} error={error} />
    </label>
  );
}

function Area({ label, name, value, onChange, defaultValue, rows, hint, error, mono }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; rows: number; hint?: string; error?: string; mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <textarea name={name} rows={rows}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className={`rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal ${
          mono ? 'font-[family-name:var(--font-mono)] text-[var(--text-sm)]' : ''}`}
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      <Hint hint={hint} error={error} />
    </label>
  );
}

function Counted({ label, name, value, onChange, max, hint, placeholder, textarea }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  max: number; hint: string; placeholder?: string; textarea?: boolean;
}) {
  const over = value.length > max;
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      <span className="flex items-baseline justify-between">
        {label}
        <span className={`text-[var(--text-xs)] font-normal ${over ? 'text-[var(--pomegranate)]' : 'text-[var(--ink-faint)]'}`}>
          {value.length}/{max}{over ? ' — will be cut off' : ''}
        </span>
      </span>
      {textarea
        ? <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder}
            className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal" />
        : <input name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal" />}
      <Hint hint={hint} />
    </label>
  );
}

function Select({ label, name, value, onChange, defaultValue, options, hint, error, allowEmpty }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; options: Option[]; hint?: string; error?: string; allowEmpty?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <select name={name}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal capitalize"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined}>
        {allowEmpty && <option value="">None</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <Hint hint={hint} error={error} />
    </label>
  );
}

const Hint = ({ hint, error }: { hint?: string; error?: string }) =>
  error ? <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{error}</span>
  : hint ? <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">{hint}</span>
  : null;

const cut = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
