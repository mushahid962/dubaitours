import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BadgeCheck, Building2, ShieldCheck } from 'lucide-react';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { requireActor } from '@/lib/auth/session';
import { ROLE_META } from '@/lib/auth/roles';
import { ProfileForm } from '@/components/auth/profile-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } };

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  const actor = await requireActor(locale, `${prefix}/account`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          {actor.displayName ?? 'Your account'}
        </h1>
        <p className="flex flex-wrap items-center gap-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
          <span>{actor.email}</span>
          {actor.emailVerified && (
            <span className="inline-flex items-center gap-1 text-[var(--teal)]">
              <BadgeCheck className="h-4 w-4" aria-hidden /> Verified
            </span>
          )}
          <span className="rounded-full bg-[var(--limestone)] px-2.5 py-0.5 text-[var(--text-xs)]">
            {ROLE_META[actor.role].label}
          </span>
        </p>
      </header>

      {actor.companies.length > 0 && (
        <section aria-labelledby="businesses" className="flex flex-col gap-3">
          <h2 id="businesses" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
            Your businesses
          </h2>
          <ul className="flex flex-col gap-2">
            {actor.companies.map((company) => (
              <li key={company.id}>
                <Link href={`${prefix}/dashboard/${company.slug}`}
                  className="dune-lift flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                  <Building2 className="h-5 w-5 text-[var(--teal)]" aria-hidden />
                  <span className="flex-1 font-medium">{company.name}</span>
                  <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                    {ROLE_META[company.role]?.label ?? company.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {actor.permissions.length > 0 && (
        <section aria-labelledby="access" className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-5">
          <h2 id="access" className="flex items-center gap-2 text-[var(--text-lg)] font-semibold">
            <ShieldCheck className="h-5 w-5 text-[var(--teal)]" aria-hidden /> What you can do
          </h2>
          {/* Showing people their own permissions makes the system legible and
              makes a wrong role assignment obvious to the person holding it. */}
          <ul className="flex flex-wrap gap-1.5">
            {actor.permissions.map((permission) => (
              <li key={permission} className="rounded-[var(--radius-sm)] bg-[var(--limestone)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--ink-soft)]">
                {permission}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="profile" className="flex flex-col gap-3">
        <h2 id="profile" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
          Your details
        </h2>
        <ProfileForm actor={{
          displayName: actor.displayName ?? '',
          preferredLocale: actor.preferredLocale,
          preferredCurrency: actor.preferredCurrency,
        }} />
      </section>
    </div>
  );
}
