'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

type LeadCaptureProps = {
  source: string;
  variant?: 'light' | 'dark';
};

export function LeadCapture({ source, variant = 'light' }: LeadCaptureProps) {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '');
    const email = String(form.get('email') ?? '');
    const phone = String(form.get('phone') ?? '');
    const company = String(form.get('company') ?? '');

    setIsSending(true);
    const subject = encodeURIComponent('TourLeads - request for sample leads');
    const body = encodeURIComponent(
      `Hi TourLeads,\n\nI would like to receive sample tour leads.\n\nName: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nSource: ${source}`,
    );

    window.location.href = `mailto:sales@tourleads.ae?subject=${subject}&body=${body}`;
    window.setTimeout(() => {
      setIsSending(false);
      setSent(true);
    }, 450);
  }

  if (sent) {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
        variant === 'dark'
          ? 'border-white/15 bg-white/10 text-white'
          : 'border-[var(--teal)]/20 bg-[var(--teal-wash)] text-[var(--teal-deep)]'
      }`}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p><strong>Almost there.</strong> Your email app is ready with your details. Send it and we&apos;ll share relevant sample leads within one business day.</p>
      </div>
    );
  }

  const inputClass = variant === 'dark'
    ? 'border-white/15 bg-white/10 text-white placeholder:text-white/50 focus:border-[#75d4c6]'
    : 'border-[var(--hairline)] bg-white text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--teal)]';

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className="sr-only" htmlFor={`${source}-name`}>Your name</label>
      <input id={`${source}-name`} name="name" required autoComplete="name" placeholder="Your name" className={`h-12 rounded-xl border px-4 text-sm outline-none transition ${inputClass}`} />
      <label className="sr-only" htmlFor={`${source}-company`}>Company name</label>
      <input id={`${source}-company`} name="company" required autoComplete="organization" placeholder="Tour company name" className={`h-12 rounded-xl border px-4 text-sm outline-none transition ${inputClass}`} />
      <label className="sr-only" htmlFor={`${source}-email`}>Work email</label>
      <input id={`${source}-email`} name="email" required type="email" autoComplete="email" placeholder="Work email" className={`h-12 rounded-xl border px-4 text-sm outline-none transition ${inputClass}`} />
      <label className="sr-only" htmlFor={`${source}-phone`}>Phone or WhatsApp</label>
      <input id={`${source}-phone`} name="phone" required type="tel" autoComplete="tel" placeholder="Phone / WhatsApp" className={`h-12 rounded-xl border px-4 text-sm outline-none transition ${inputClass}`} />
      <button type="submit" disabled={isSending} className="group col-span-full flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F5BB58] px-5 text-sm font-bold text-[#10231F] transition hover:bg-[#ffd27f] disabled:cursor-wait disabled:opacity-70">
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <>Get 5 sample leads <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></>}
      </button>
      <p className={`col-span-full text-center text-xs ${variant === 'dark' ? 'text-white/55' : 'text-[var(--ink-faint)]'}`}>
        No contract. No card required. We only contact you about TourLeads.
      </p>
    </form>
  );
}
