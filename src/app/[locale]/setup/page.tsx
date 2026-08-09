import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ShieldCheck, Database, AlertTriangle } from 'lucide-react';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { SetupForm } from '@/components/setup/setup-form';

// Never cached, never indexed. A cached "setup is open" page would keep
// offering the form after it had closed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-20">
        <Database className="h-10 w-10 text-[var(--brass)]" aria-hidden />
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          Connect the database first
        </h1>
        <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
          There is nowhere to create an account yet. Follow{' '}
          <code className="font-[family-name:var(--font-mono)]">docs/DATABASE-SETUP.md</code>,
          then come back here.
        </p>
      </div>
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: complete } = await admin.rpc('is_setup_complete');

  // Once a super admin exists this page does not exist either. 404 rather
  // than a message, so it cannot be found by anyone probing for it.
  if (complete) notFound();

  const tokenRequired = Boolean(process.env.SETUP_TOKEN);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-3">
        <ShieldCheck className="h-10 w-10 text-[var(--teal)]" aria-hidden />
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
          Create your admin account
        </h1>
        <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
          This page works once. As soon as this account exists, it closes
          permanently and returns 404 — nobody else can use it to grant themselves access.
        </p>
      </header>

      {!tokenRequired && (
        <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--brass-wash)] p-3 text-[var(--text-sm)] text-[var(--ink-soft)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" aria-hidden />
          <span>
            This site is live and this page is currently open to anyone who finds it.
            Complete it now. To require a password on this page as well, set a{' '}
            <code className="font-[family-name:var(--font-mono)]">SETUP_TOKEN</code>{' '}
            environment variable and redeploy.
          </span>
        </p>
      )}

      <SetupForm locale={locale} tokenRequired={tokenRequired} />
    </div>
  );
}
