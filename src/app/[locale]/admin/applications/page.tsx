import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/format';
import { ApplicationReviewCard } from '@/components/admin/application-review-card';

// Admin surfaces are never cached and never indexed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ApplicationsQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  await requireAdmin(locale, '/admin/applications');

  const supabase = await getSupabaseServerClient();
  const { data: applications } = await supabase
    .from('company_applications')
    .select(`
      id, status, legal_name, display_name, contact_email, contact_phone, website, about,
      years_operating, tour_count_estimate, trade_license_no, trade_license_url,
      insurance_url, tourism_permit_url, submitted_at, info_requested,
      country:countries ( iso2, flag_emoji ),
      applicant:profiles!company_applications_submitted_by_fkey ( full_name, created_at )
    `)
    .in('status', ['submitted', 'under_review', 'needs_info'])
    .order('submitted_at', { ascending: true });

  const queue = applications ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          Partner applications
        </h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          {queue.length === 0
            ? 'Nothing waiting. New applications appear here the moment an operator submits.'
            : `${queue.length} waiting, oldest first. Approving creates the company and makes the applicant its owner.`}
        </p>
      </header>

      {queue.map((application) => {
        const country = application.country as never as { iso2: string; flag_emoji: string | null } | null;
        const applicant = application.applicant as never as { full_name: string | null; created_at: string } | null;

        return (
          <ApplicationReviewCard
            key={application.id}
            application={{
              id: application.id,
              status: application.status,
              legalName: application.legal_name,
              displayName: application.display_name,
              contactEmail: application.contact_email,
              contactPhone: application.contact_phone,
              website: application.website,
              about: application.about,
              yearsOperating: application.years_operating,
              tourCountEstimate: application.tour_count_estimate,
              tradeLicenseNo: application.trade_license_no,
              tradeLicenseUrl: application.trade_license_url,
              insuranceUrl: application.insurance_url,
              tourismPermitUrl: application.tourism_permit_url,
              countryFlag: country?.flag_emoji ?? '',
              countryCode: country?.iso2 ?? '',
              applicantName: applicant?.full_name ?? 'Unknown',
              accountAgeDays: applicant
                ? Math.floor((Date.now() - new Date(applicant.created_at).getTime()) / 86_400_000)
                : 0,
              submittedAt: application.submitted_at ? formatDate(application.submitted_at, locale) : '—',
              infoRequested: application.info_requested,
            }}
          />
        );
      })}
    </div>
  );
}
