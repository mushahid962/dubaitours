import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isLocale } from '@/lib/i18n/config';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Set a new password</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Choose something long. Length resists guessing far better than punctuation does.
        </p>
      </header>
      <ResetPasswordForm />
    </div>
  );
}
