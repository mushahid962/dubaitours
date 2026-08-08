'use client';

import { useActionState, useState } from 'react';
import { FileText, ShieldAlert, Loader2, ExternalLink } from 'lucide-react';
import { reviewApplicationAction, type ReviewState } from '@/actions/review-application';

export type ApplicationForReview = {
  id: string;
  status: string;
  legalName: string;
  displayName: string;
  contactEmail: string;
  contactPhone: string;
  website: string | null;
  about: string;
  yearsOperating: number | null;
  tourCountEstimate: number | null;
  tradeLicenseNo: string;
  tradeLicenseUrl: string;
  insuranceUrl: string | null;
  tourismPermitUrl: string | null;
  countryFlag: string;
  countryCode: string;
  applicantName: string;
  accountAgeDays: number;
  submittedAt: string;
  infoRequested: string | null;
};

type Decision = 'approve' | 'reject' | 'request_info' | null;

export function ApplicationReviewCard({ application }: { application: ApplicationForReview }) {
  const [decision, setDecision] = useState<Decision>(null);
  const [state, submit, isPending] = useActionState<ReviewState, FormData>(
    reviewApplicationAction,
    { status: 'idle' },
  );

  if (state.status === 'done') {
    return (
      <p className="rounded-[var(--radius-lg)] bg-[var(--teal-wash)] p-4 text-[var(--text-sm)] text-[var(--teal-deep)]">
        {state.message}
      </p>
    );
  }

  // Signals worth a second look before approving. Not blockers — a brand-new
  // account is normal for a first-time operator — but they belong in front of
  // the reviewer rather than buried in a table.
  const flags = [
    application.accountAgeDays < 1 && 'Account created today',
    !application.insuranceUrl && 'No insurance document',
    !application.tourismPermitUrl && 'No tourism permit',
    (application.yearsOperating ?? 0) === 0 && 'New operator, no trading history',
  ].filter(Boolean) as string[];

  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[var(--text-xl)] font-semibold">
            {application.countryFlag} {application.displayName}
          </h2>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            {application.legalName} · licence {application.tradeLicenseNo}
          </p>
          <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
            {application.applicantName} · submitted {application.submittedAt}
            {application.status === 'needs_info' && ' · awaiting applicant'}
          </p>
        </div>

        <ul className="flex flex-wrap gap-2">
          {[
            { label: 'Trade licence', url: application.tradeLicenseUrl },
            { label: 'Insurance', url: application.insuranceUrl },
            { label: 'Tourism permit', url: application.tourismPermitUrl },
          ]
            .filter((doc) => doc.url)
            .map((doc) => (
              <li key={doc.label}>
                <a
                  href={doc.url!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--text-xs)] font-medium hover:border-[var(--teal)] hover:text-[var(--teal)]"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {doc.label}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
        </ul>
      </header>

      <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{application.about}</p>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--text-xs)]">
        {[
          ['Years operating', application.yearsOperating ?? '—'],
          ['Tours planned', application.tourCountEstimate ?? '—'],
          ['Contact', application.contactEmail],
          ['Phone', application.contactPhone],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex gap-1.5">
            <dt className="text-[var(--ink-faint)]">{label}:</dt>
            <dd className="font-medium">{String(value)}</dd>
          </div>
        ))}
      </dl>

      {flags.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-xs)] text-[var(--ink-soft)]">
          <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />
          Worth checking: {flags.join(' · ')}
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{state.message}</p>
      )}

      {decision === null ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-4">
          <button type="button" onClick={() => setDecision('approve')}
            className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2 text-[var(--text-sm)] font-semibold text-white">
            Approve
          </button>
          <button type="button" onClick={() => setDecision('request_info')}
            className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2 text-[var(--text-sm)] font-semibold">
            Ask for more
          </button>
          <button type="button" onClick={() => setDecision('reject')}
            className="rounded-[var(--radius-pill)] border border-[var(--hairline)] px-5 py-2 text-[var(--text-sm)] font-semibold text-[var(--pomegranate)]">
            Reject
          </button>
        </div>
      ) : (
        <form action={submit} className="flex flex-col gap-3 border-t border-[var(--hairline)] pt-4">
          <input type="hidden" name="applicationId" value={application.id} />
          <input type="hidden" name="decision" value={decision} />

          {decision === 'approve' && (
            <label className="flex flex-col gap-1 text-[var(--text-sm)]">
              Commission rate
              <span className="flex items-center gap-2">
                <input
                  type="number" name="commissionRate" defaultValue={20} min={0} max={50} step={0.5} required
                  className="w-28 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 py-2"
                />
                <span className="text-[var(--ink-faint)]">% of each booking</span>
              </span>
              <textarea name="note" rows={2} placeholder="Internal note — what did you verify?"
                className="mt-2 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 py-2" />
            </label>
          )}

          {decision === 'reject' && (
            <label className="flex flex-col gap-1 text-[var(--text-sm)]">
              Why are you rejecting this? The applicant sees this text.
              <textarea name="reason" rows={3} required minLength={10}
                placeholder="The trade licence uploaded expired in March 2026. Upload a current one and reapply."
                className="rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 py-2" />
            </label>
          )}

          {decision === 'request_info' && (
            <label className="flex flex-col gap-1 text-[var(--text-sm)]">
              What do you need from them?
              <textarea name="message" rows={3} required minLength={10}
                placeholder="Send your public liability insurance certificate covering desert activities."
                className="rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 py-2" />
            </label>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={isPending}
              className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2 text-[var(--text-sm)] font-semibold text-white disabled:opacity-50">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {decision === 'approve' ? 'Approve operator' : decision === 'reject' ? 'Reject application' : 'Send request'}
            </button>
            <button type="button" onClick={() => setDecision(null)}
              className="rounded-[var(--radius-pill)] px-4 py-2 text-[var(--text-sm)] text-[var(--ink-soft)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
