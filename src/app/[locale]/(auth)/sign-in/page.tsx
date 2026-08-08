import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { SignInForm } from '@/components/auth/sign-in-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const { next, error } = await searchParams;
  // Open-redirect guard. `//evil.com` is a valid protocol-relative URL, so a
  // leading-slash check alone is not enough.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Sign in</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          We'll email you a link. No password to remember, and nothing to leak.
        </p>
      </header>

      {error === 'expired_link' && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
          That link had expired. Request a new one below.
        </p>
      )}

      <SignInForm locale={locale} next={safeNext} />

      <p className="text-[var(--text-xs)] text-[var(--ink-faint)]">
        You don't need an account to book — guest checkout works fine. Signing in
        keeps your bookings, wishlist and reviews in one place.
      </p>
    </div>
  );
}
