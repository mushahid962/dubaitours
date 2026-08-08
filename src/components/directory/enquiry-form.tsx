'use client';

import { useActionState } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { submitEnquiryAction, type EnquiryState } from '@/actions/enquiry';

/**
 * Enquiry form for verticals that do not transact.
 *
 * It asks for what a supplier needs to quote: party size, dates, budget,
 * pickup and language. A form that collects only a name and a message
 * generates leads nobody can price, and those leads die in the inbox.
 */
export function EnquiryForm({
  listingId, verticalId, cityId, listingName, landingPage,
}: {
  listingId?: string; verticalId?: string; cityId?: string;
  listingName?: string; landingPage: string;
}) {
  const [state, submit, isPending] = useActionState<EnquiryState, FormData>(
    submitEnquiryAction, { status: 'idle' },
  );

  const err = (name: string) => state.status === 'error' ? state.fieldErrors?.[name]?.[0] : undefined;

  if (state.status === 'done') {
    return (
      <div className="flex flex-col items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-6">
        <CheckCircle2 className="h-8 w-8 text-[var(--teal)]" aria-hidden />
        <h2 className="text-[var(--text-xl)] font-semibold text-[var(--teal-deep)]">Enquiry sent</h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
      {listingId && <input type="hidden" name="listingId" value={listingId} />}
      {verticalId && <input type="hidden" name="verticalId" value={verticalId} />}
      {cityId && <input type="hidden" name="cityId" value={cityId} />}
      <input type="hidden" name="landingPage" value={landingPage} />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off"
        aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0" />

      <div className="flex flex-col gap-1">
        <h2 className="text-[var(--text-xl)] font-semibold">
          {listingName ? `Enquire about ${listingName}` : 'Tell us what you need'}
        </h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          The more you tell us, the more precise the quote. We reply within one working day.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Your name" required error={err('name')} />
        <Field name="email" label="Email" type="email" required error={err('email')} />
        <Field name="phone" label="Phone (with country code)" required placeholder="+971 50 123 4567" error={err('phone')} />
        <Select name="preferredContact" label="Best way to reach you"
          options={[['email', 'Email'], ['phone', 'Phone call'], ['whatsapp', 'WhatsApp']]} />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="pb-2 text-[var(--text-sm)] font-semibold">Your trip</legend>
        <Field name="partySize" label="Adults" type="number" defaultValue="2" required error={err('partySize')} />
        <Field name="childrenCount" label="Children" type="number" defaultValue="0" />
        <Field name="travelDate" label="Travel date" type="date" error={err('travelDate')} />
        <Field name="budgetPerPerson" label="Budget per person (optional)" type="number"
          hint="Helps us shortlist rather than send you everything." />
      </fieldset>

      <label className="flex items-center gap-2 text-[var(--text-sm)]">
        <input type="checkbox" name="flexibleDates" className="accent-[var(--teal)]" />
        My dates are flexible
      </label>

      <label className="flex items-center gap-2 text-[var(--text-sm)]">
        <input type="checkbox" name="needsPickup" className="accent-[var(--teal)]" />
        I need hotel pickup
      </label>

      <Field name="pickupLocation" label="Pickup location (optional)" placeholder="Hotel name or area" />
      <Field name="language" label="Preferred guide language (optional)" placeholder="English, Arabic, Hindi…" />

      <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
        Anything else?
        <textarea name="message" rows={3}
          placeholder="Accessibility needs, occasion, must-sees, anything that would change what you'd recommend."
          className="rounded-[var(--radius-md)] border border-[var(--hairline)] p-3 font-normal" />
      </label>

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      <button type="submit" disabled={isPending}
        className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] font-semibold text-white disabled:opacity-60">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        Send enquiry
      </button>

      <p className="text-center text-[var(--text-xs)] text-[var(--ink-faint)]">
        No payment now. We only use these details to answer your enquiry.
      </p>
    </form>
  );
}

function Field({ name, label, type = 'text', required, placeholder, defaultValue, hint, error }: {
  name: string; label: string; type?: string; required?: boolean;
  placeholder?: string; defaultValue?: string; hint?: string; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal"
        style={error ? { borderColor: 'var(--pomegranate)' } : undefined} />
      {error ? <span className="text-[var(--text-xs)] font-normal text-[var(--pomegranate)]">{error}</span>
        : hint ? <span className="text-[var(--text-xs)] font-normal text-[var(--ink-faint)]">{hint}</span> : null}
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: Array<[string, string]> }) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-sm)] font-medium">
      {label}
      <select name={name} className="h-11 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--paper)] px-3 font-normal">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}
