import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getActor } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/roles';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: true } };

export default async function SignUpPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  // Already signed in? Sending them to a sign-up form is a dead end.
  const actor = await getActor();
  if (actor) redirect(homeForRole(actor.role));

  const { next } = await searchParams;
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/account';

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Create an account</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          You do not need one to book — guest checkout works fine. An account keeps your bookings,
          wishlist and reviews together.
        </p>
      </header>
      <SignUpForm locale={locale} next={safeNext} />
    </div>
  );
}
