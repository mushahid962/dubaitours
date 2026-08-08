'use client';

import { useActionState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { submitApplicationAction, type ApplicationState } from '@/actions/company-application';
import type { Locale } from '@/lib/i18n/config';

type Existing = {
  id: string; legalName: string; displayName: string; countryId: string;
  contactEmail: string; contactPhone: string; about: string;
  yearsOperating: number; tourCountEstimate: number;
  tradeLicenseNo: string; tradeLicenseUrl: string;
};

export function ApplicationForm({
  locale, defaultEmail, existing, countries, categories,
}: {
  locale: Locale; defaultEmail: string; existing: Existing | null;
  countries: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, submit, isPending] = useActionState<ApplicationState, FormData>(
    submitApplicationAction,
    { status: 'idle' },
  );

  const fieldError = (name: string) =>
    state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;

  if (state.status === 'submitted') {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <h2 className="text-[var(--text-xl)] font-semibold text-[var(--teal-deep)]">Application received</h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          We check every trade licence by hand — usually one to two working days. We'll email you
          either way.
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-6 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
      {existing && <input type="hidden" name="applicationId" value={existing.id} />}
      <input type="hidden" name="locale" value={locale} />

      <Fieldset legend="Your business">
        <Field name="legalName" label="Legal name (as on your trade licence)" defaultValue={existing?.legalName} required error={fieldError('legalName')} />
        <Field name="displayName" label="Name travellers will see" defaultValue={existing?.displayName} required error={fieldError('displayName')} />

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          Country you operate in
          <select
            name="countryId" required defaultValue={existing?.countryId ?? ''}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal"
          >
            <option value="" disabled>Choose a country</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>
          {fieldError('countryId') && <ErrorText>{fieldError('countryId')}</ErrorText>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="yearsOperating" label="Years operating" type="number" defaultValue={String(existing?.yearsOperating ?? '')} required error={fieldError('yearsOperating')} />
          <Field name="tourCountEstimate" label="Experiences you plan to list" type="number" defaultValue={String(existing?.tourCountEstimate ?? '')} required error={fieldError('tourCountEstimate')} />
        </div>

        <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
          What do you run, and where?
          <textarea
            name="about" rows={4} required minLength={120} defaultValue={existing?.about}
            placeholder="Family-run dune buggy operator working the Al Badayer dunes since 2014. Six vehicles, English and Arabic guides, hotel pickup across Dubai."
            className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] p-3 font-normal"
          />
          <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
            At least 120 characters. This becomes your public operator profile.
          </span>
          {fieldError('about') && <ErrorText>{fieldError('about')}</ErrorText>}
        </label>
      </Fieldset>

      <Fieldset legend="How we reach you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="contactEmail" label="Email" type="email" defaultValue={existing?.contactEmail || defaultEmail} required error={fieldError('contactEmail')} />
          <Field name="contactPhone" label="Phone (with country code)" defaultValue={existing?.contactPhone} required placeholder="+971 50 123 4567" error={fieldError('contactPhone')} />
        </div>
      </Fieldset>

      <Fieldset legend="Verification">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="tradeLicenseNo" label="Trade licence number" defaultValue={existing?.tradeLicenseNo} required error={fieldError('tradeLicenseNo')} />
          <Field name="tradeLicenseUrl" label="Link to your trade licence" defaultValue={existing?.tradeLicenseUrl} required placeholder="https://…" error={fieldError('tradeLicenseUrl')} />
        </div>
        {/* File upload needs a private storage bucket with signed URLs —
            trade licences are not public documents. Until that ships, a link
            keeps the flow honest rather than pretending to store files. */}
        <p className="flex items-start gap-2 text-[var(--text-xs)] text-[var(--ink-faint)]">
          <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Direct upload is coming. For now, paste a link we can open — we'll only use it for verification.
        </p>
      </Fieldset>

      {categories.length > 0 && (
        <Fieldset legend="What you offer">
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--text-sm)] font-normal">
                  <input type="checkbox" name="categories" value={category.id} className="accent-[var(--teal)]" />
                  {category.name}
                </label>
              </li>
            ))}
          </ul>
          {fieldError('categories') && <ErrorText>{fieldError('categories')}</ErrorText>}
        </Fieldset>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-4">
        <label className="flex items-start gap-2 text-[var(--text-sm)]">
          <input type="checkbox" name="confirmsAccuracy" required className="mt-1 accent-[var(--teal)]" />
          Everything here is accurate, and I'm authorised to represent this business.
        </label>
        <label className="flex items-start gap-2 text-[var(--text-sm)]">
          <input type="checkbox" name="acceptsTerms" required className="mt-1 accent-[var(--teal)]" />
          I accept the partner terms, including the commission on each booking.
        </label>
      </div>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <button
        type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Submit application
      </button>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="pb-2 text-[var(--text-lg)] font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({ name, label, type = 'text', defaultValue, required, placeholder, error }: {
  name: string; label: string; type?: string; defaultValue?: string;
  required?: boolean; placeholder?: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <input
        name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </label>
  );
}

const ErrorText = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{children}</span>
);
