import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, Clock3, FileText } from 'lucide-react';
import { getActor } from '@/lib/auth/session';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { buildMetadata } from '@/lib/seo/metadata';
import { ApplicationForm } from '@/components/partner/application-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return buildMetadata({
    locale,
    title: 'List your tours on TravelHub Gulf',
    description:
      'Apply to list your tours and experiences across the UAE, Saudi Arabia, Qatar, Oman, Bahrain and Kuwait. We verify every operator before they go live.',
    path: (candidate) => `${candidate === 'en' ? '' : `/${candidate}`}/partner/apply`,
  });
}

export default async function PartnerApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  const actor = await getActor();

  // Marketing copy renders for everyone — the pitch has to be readable and
  // indexable without an account. Only the form itself needs a session.
  const pitch = (
    <header className="flex flex-col gap-4">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-4xl)] leading-tight">
        List your tours where travellers are already looking
      </h1>
      <p className="max-w-xl text-[var(--text-lg)] text-[var(--ink-soft)]">
        Reach travellers across six GCC countries in English, Arabic, Hindi and Urdu.
        You set the prices and availability; we handle discovery, payment and support.
      </p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          ['Free to list', 'No listing fee. We take a commission only when you get a booking.'],
          ['Paid weekly', 'Payouts every Monday for completed experiences, in your local currency.'],
          ['Verified only', 'We check every trade licence, which is why travellers trust the listings.'],
        ].map(([title, body]) => (
          <li key={title} className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
            <span className="font-semibold">{title}</span>
            <span className="text-[var(--text-sm)] text-[var(--ink-soft)]">{body}</span>
          </li>
        ))}
      </ul>
    </header>
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        {pitch}
        <p className="rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-5 text-[var(--text-sm)] text-[var(--ink-soft)]">
          Applications open once the database is connected — Part 3 of{' '}
          <code className="font-[family-name:var(--font-mono)]">docs/GETTING-STARTED.md</code>.
        </p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        {pitch}
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
          <h2 className="text-[var(--text-xl)] font-semibold">Ready to apply?</h2>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            Sign in first so you can save your progress and track the review.
          </p>
          <Link
            href={`${prefix}/sign-in?next=${encodeURIComponent(`${prefix}/partner/apply`)}`}
            className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white"
          >
            Sign in to apply
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await getSupabaseServerClient();
  const [{ data: existing }, { data: countries }, { data: categories }] = await Promise.all([
    supabase.from('company_applications')
      .select('id, status, rejection_reason, info_requested, legal_name, display_name, country_id, contact_email, contact_phone, about, years_operating, tour_count_estimate, trade_license_no, trade_license_url')
      .eq('submitted_by', actor.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('country_translations').select('country_id, name').eq('locale', locale),
    supabase.from('category_translations').select('category_id, name').eq('locale', locale).limit(20),
  ]);

  const application = existing as unknown as Record<string, any> | null;

  if (application && ['submitted', 'under_review'].includes(application.status)) {
    return <StatusPanel
      icon={<Clock3 className="h-10 w-10 text-[var(--brass)]" aria-hidden />}
      title="Your application is with our team"
      body="We check every trade licence by hand, which usually takes one to two working days. We'll email you the moment there's a decision."
    />;
  }

  if (application?.status === 'approved') {
    return <StatusPanel
      icon={<CheckCircle2 className="h-10 w-10 text-[var(--teal)]" aria-hidden />}
      title="You're approved"
      body="Your operator profile is live. Open your dashboard to add your first experience."
      action={{ href: `${prefix}/account`, label: 'Go to your dashboard' }}
    />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      {pitch}

      {application?.status === 'needs_info' && (
        <p className="flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-4 text-[var(--text-sm)] text-[var(--ink-soft)]">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />
          <span><strong>We need one more thing:</strong> {application.info_requested}</span>
        </p>
      )}

      {application?.status === 'rejected' && (
        <p className="rounded-[var(--radius-lg)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-4 text-[var(--text-sm)] text-[var(--pomegranate)]">
          <strong>Your last application wasn't approved:</strong> {application.rejection_reason}
          {' '}You're welcome to fix that and apply again below.
        </p>
      )}

      <ApplicationForm
        locale={locale}
        defaultEmail={actor.email ?? ''}
        existing={application && ['draft', 'needs_info'].includes(application.status) ? {
          id: application.id,
          legalName: application.legal_name ?? '',
          displayName: application.display_name ?? '',
          countryId: application.country_id ?? '',
          contactEmail: application.contact_email ?? '',
          contactPhone: application.contact_phone ?? '',
          about: application.about ?? '',
          yearsOperating: application.years_operating ?? 0,
          tourCountEstimate: application.tour_count_estimate ?? 1,
          tradeLicenseNo: application.trade_license_no ?? '',
          tradeLicenseUrl: application.trade_license_url ?? '',
        } : null}
        countries={((countries ?? []) as unknown as Array<{ country_id: string; name: string }>)
          .map((c) => ({ id: c.country_id, name: c.name }))}
        categories={((categories ?? []) as unknown as Array<{ category_id: string; name: string }>)
          .map((c) => ({ id: c.category_id, name: c.name }))}
      />
    </div>
  );
}

function StatusPanel({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-24">
      {icon}
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">{title}</h1>
      <p className="text-[var(--text-base)] text-[var(--ink-soft)]">{body}</p>
      {action && (
        <Link href={action.href} className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
          {action.label}
        </Link>
      )}
    </div>
  );
}
