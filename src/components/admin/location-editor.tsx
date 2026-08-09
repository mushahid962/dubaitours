'use client';

import { useActionState, useState } from 'react';
import { Loader2, MapPin, Search, Settings2, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { saveLocationAction, deleteLocationAction, type LocationState } from '@/actions/location-admin';
import type { Locale } from '@/lib/i18n/config';

export type LocationDraft = {
  id?: string; level: string; parentId: string; countryCode: string; locationCode: string;
  timezone: string; latitude: string; longitude: string; radiusM: string;
  name: string; slug: string; h1: string; tagline: string;
  intro: string; description: string; body: string;
  metaTitle: string; metaDescription: string; canonicalUrl: string; robots: string;
  ogTitle: string; ogDescription: string;
  heroImageUrl: string; status: string; displayOrder: number;
  isFeatured: boolean; isIndexable: boolean;
  listingCount: number; childCount: number;
};

const TABS = [
  { key: 'place', label: 'Place', icon: MapPin },
  { key: 'content', label: 'Content', icon: Settings2 },
  { key: 'seo', label: 'SEO', icon: Search },
] as const;

const LEVELS = ['country', 'region', 'city', 'district', 'neighborhood', 'poi'];
const TIMEZONES = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Muscat', 'Asia/Bahrain', 'Asia/Kuwait'];

export function LocationEditor({
  locale, draft, parents,
}: { locale: Locale; draft: LocationDraft; parents: Array<{ id: string; label: string }> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('place');
  const [state, submit, isPending] = useActionState<LocationState, FormData>(
    saveLocationAction, { status: 'idle' },
  );
  const [, remove, isDeleting] = useActionState<LocationState, FormData>(
    deleteLocationAction, { status: 'idle' },
  );

  const [level, setLevel] = useState(draft.level);
  const [name, setName] = useState(draft.name);
  const [slug, setSlug] = useState(draft.slug);
  const [intro, setIntro] = useState(draft.intro);
  const [metaTitle, setMetaTitle] = useState(draft.metaTitle);
  const [metaDescription, setMetaDescription] = useState(draft.metaDescription);
  const [isIndexable, setIsIndexable] = useState(draft.isIndexable);

  const err = (n: string) => state.status === 'error' ? state.fieldErrors?.[n]?.[0] : undefined;

  /* The same rule the database applies, shown live so an editor can see
     exactly what is standing between this page and the index. */
  const hasEnoughCopy = intro.length >= 250;
  const hasListings = draft.listingCount >= 3;
  const isHub = ['country', 'region'].includes(level) && draft.childCount >= 1;
  const willIndex = isIndexable && (hasListings || hasEnoughCopy || isHub);

  return (
    <form action={submit} className="flex flex-col gap-5">
      {draft.id && <input type="hidden" name="locationId" value={draft.id} />}
      <input type="hidden" name="locale" value={locale} />

      <nav className="flex gap-1 border-b border-[var(--hairline)]">
        {TABS.map((item) => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-[var(--text-sm)] font-medium ${
              tab === item.key ? 'border-[var(--teal)] text-[var(--teal)]'
                               : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}>
            <item.icon className="h-4 w-4" aria-hidden /> {item.label}
          </button>
        ))}
      </nav>

      {/* Fields on hidden tabs must still submit, so panels are hidden with
          CSS rather than unmounted. */}
      <Panel show={tab === 'place'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Level" name="level" value={level} onChange={setLevel}
            options={LEVELS.map((l) => ({ value: l, label: l }))} error={err('level')}
            hint="Country sits at the root. Everything else needs a parent." />

          <Select label="Parent" name="parentId" defaultValue={draft.parentId}
            options={[{ value: '', label: level === 'country' ? 'None (root)' : 'Choose a parent…' },
                      ...parents.map((p) => ({ value: p.id, label: p.label }))]}
            error={err('parentId')} />

          <Field label="Country code" name="countryCode" defaultValue={draft.countryCode}
            error={err('countryCode')} hint="Two-letter ISO, e.g. AE" />
          <Field label="Location code" name="locationCode" defaultValue={draft.locationCode}
            hint="Optional: AE-DU, an IATA code, a municipality reference." />

          <Select label="Timezone" name="timezone" defaultValue={draft.timezone}
            options={TIMEZONES.map((t) => ({ value: t, label: t }))} error={err('timezone')} />
          <Field label="Hero image URL" name="heroImageUrl" defaultValue={draft.heroImageUrl} />

          <Field label="Latitude" name="latitude" defaultValue={draft.latitude} error={err('latitude')} />
          <Field label="Longitude" name="longitude" defaultValue={draft.longitude} error={err('longitude')}
            hint="Both or neither — a latitude alone maps to the Gulf of Guinea." />

          <Field label="Radius (metres)" name="radiusM" defaultValue={draft.radiusM}
            hint="Optional. Used for 'within this area' searches." />
          <Field label="Display order" name="displayOrder" defaultValue={String(draft.displayOrder)}
            hint="Higher sorts first. Editorial control over the default order." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Status" name="status" defaultValue={draft.status}
            options={[
              { value: 'draft', label: 'Draft — not on the site' },
              { value: 'published', label: 'Published — live' },
              { value: 'archived', label: 'Archived — removed' },
            ]} />
          <label className="flex items-center gap-2 self-end pb-3 text-[var(--text-sm)]">
            <input type="checkbox" name="isFeatured" defaultChecked={draft.isFeatured}
              className="accent-[var(--teal)]" />
            Feature on the destinations index
          </label>
        </div>
      </Panel>

      <Panel show={tab === 'content'}>
        <Field label="Name" name="name" value={name} onChange={setName} error={err('name')}
          hint="The place itself: 'Dubai Marina'." />
        <Field label="URL slug" name="slug" value={slug} onChange={setSlug} error={err('slug')}
          prefix="/destinations/"
          hint="Globally unique across every level. Changing it on a live page writes a 301 automatically." />
        <Field label="H1" name="h1" defaultValue={draft.h1}
          hint="The on-page heading: 'Things to Do in Dubai Marina'. Different from the name and from the title tag on purpose." />
        <Field label="Tagline" name="tagline" defaultValue={draft.tagline}
          hint="One line under the H1." />

        <Area label="Introduction" name="intro" value={intro} onChange={setIntro} rows={6}
          hint={`${intro.length} characters. 250+ earns indexation on its own, without any listings.`} />
        <Area label="Description" name="description" defaultValue={draft.description} rows={4} />
        <Area label="Body" name="body" defaultValue={draft.body} rows={10}
          hint="Long-form guide content, shown below the child locations." />
      </Panel>

      <Panel show={tab === 'seo'}>
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--limestone)] p-4">
          <p className="text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            How this looks on Google
          </p>
          <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] bg-[var(--paper)] p-4">
            <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">
              travelhubgulf.com › destinations › {slug || 'your-place'}
            </span>
            <span className="text-[var(--text-lg)] text-[#1a0dab]">
              {cut(metaTitle || `Things to Do in ${name || 'this place'}`, 60)}
            </span>
            <span className="text-[var(--text-sm)] leading-snug text-[var(--ink-soft)]">
              {cut(metaDescription || intro || 'No description — Google will write one from the page.', 160)}
            </span>
          </div>
        </section>

        <div className={`flex items-start gap-2 rounded-[var(--radius-md)] p-3 text-[var(--text-sm)] ${
          willIndex ? 'bg-[var(--teal-wash)] text-[var(--teal-deep)]' : 'bg-[var(--brass-wash)] text-[var(--ink-soft)]'
        }`}>
          {willIndex
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />}
          <span>
            {willIndex ? (
              <><strong>This page will be indexed.</strong>{' '}
                {hasListings ? `${draft.listingCount} listings.` : hasEnoughCopy ? 'Enough original copy.' : 'A hub with published children.'}</>
            ) : (
              <><strong>This page will carry noindex.</strong> It needs three listings
                ({draft.listingCount} now), or 250 characters of intro ({intro.length} now)
                {['country', 'region'].includes(level) ? ', or one published child' : ''}.
                It still renders for anyone who lands on it.</>
            )}
          </span>
        </div>

        <Counted label="Meta title" name="metaTitle" value={metaTitle} onChange={setMetaTitle}
          max={60} placeholder={`Things to Do in ${name}`} />
        <Counted label="Meta description" name="metaDescription" value={metaDescription}
          onChange={setMetaDescription} max={160} textarea />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canonical URL" name="canonicalUrl" defaultValue={draft.canonicalUrl}
            error={err('canonicalUrl')}
            hint="Only if this content is duplicated elsewhere and that copy should rank." />
          <Select label="Robots" name="robots" defaultValue={draft.robots}
            options={['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']
              .map((v) => ({ value: v, label: v }))}
            hint="Can force noindex. Cannot force index on a page the gate calls thin." />
          <Field label="Social title" name="ogTitle" defaultValue={draft.ogTitle} />
          <Field label="Social description" name="ogDescription" defaultValue={draft.ogDescription} />
        </div>

        <label className="flex items-center gap-2 text-[var(--text-sm)]">
          <input type="checkbox" name="isIndexable" checked={isIndexable}
            onChange={(e) => setIsIndexable(e.target.checked)} className="accent-[var(--teal)]" />
          Allow this page to be indexed when it qualifies
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

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-[var(--hairline)] bg-[var(--salt)] py-3">
        <button type="submit" disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save location
        </button>
        <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">Saves every tab.</span>
      </div>
    </form>
  );
}

const Panel = ({ show, children }: { show: boolean; children: React.ReactNode }) => (
  <div className={show ? 'flex flex-col gap-4' : 'hidden'}>{children}</div>
);

function Field({ label, name, value, onChange, defaultValue, hint, error, prefix }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; hint?: string; error?: string; prefix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <span className="flex items-center rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] ps-3"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined}>
        {prefix && <span className="text-[var(--text-sm)] text-[var(--ink-faint)]">{prefix}</span>}
        <input name={name}
          {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
          className="h-11 flex-1 bg-transparent pe-3 font-normal outline-none" />
      </span>
      <Hint hint={hint} error={error} />
    </label>
  );
}

function Area({ label, name, value, onChange, defaultValue, rows, hint, error }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; rows: number; hint?: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <textarea name={name} rows={rows}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal" />
      <Hint hint={hint} error={error} />
    </label>
  );
}

function Counted({ label, name, value, onChange, max, placeholder, textarea }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  max: number; placeholder?: string; textarea?: boolean;
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
        ? <textarea name={name} value={value} onChange={(e) => onChange(e.target.value)} rows={3}
            placeholder={placeholder}
            className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal" />
        : <input name={name} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal" />}
    </label>
  );
}

function Select({ label, name, value, onChange, defaultValue, options, hint, error }: {
  label: string; name: string; value?: string; onChange?: (v: string) => void;
  defaultValue?: string; options: Array<{ value: string; label: string }>;
  hint?: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <select name={name}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : { defaultValue })}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal capitalize"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
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
