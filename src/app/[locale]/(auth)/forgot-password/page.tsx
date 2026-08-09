import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: true } };

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Reset your password</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Enter your email and we will send a link to set a new one.
        </p>
      </header>
      <ForgotPasswordForm locale={raw as Locale} />
    </div>
  );
}
