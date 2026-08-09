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

  // Checked before the form renders, so a misconfiguration is visible up
  // front rather than after typing a password into a form that cannot work.
  const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  checks.push({
    label: 'Service role key present',
    ok: serviceKey.length > 20,
    detail: serviceKey ? 'Set' : 'Missing — add SUPABASE_SERVICE_ROLE_KEY and redeploy',
  });
  checks.push({
    label: 'Service role key is not the anon key',
    // Pasting the anon key into both variables is the single most common
    // setup mistake, and it fails with an unhelpful "not authorized".
    ok: serviceKey.length > 20 && serviceKey !== anonKey,
    detail: serviceKey === anonKey && serviceKey
      ? 'Both keys are identical. Copy the service_role secret from Project Settings → API.'
      : 'Distinct',
  });

  let complete = false;
  let reachable = true;
  let reachError = '';
  try {
    const { data, error } = await admin.rpc('is_setup_complete');
    if (error) { reachable = false; reachError = error.message; }
    complete = Boolean(data);
  } catch (cause) {
    reachable = false;
    reachError = cause instanceof Error ? cause.message : String(cause);
  }

  checks.push({
    label: 'Database reachable and migrated',
    ok: reachable,
    detail: reachable
      ? 'is_setup_complete() responded'
      : `${reachError} — if this mentions a missing function, run part-2-schema.sql`,
  });

  const blocked = checks.some((check) => !check.ok);

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

      {blocked && (
        <section aria-label="Configuration problems" className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-4">
          <h2 className="text-[var(--text-base)] font-semibold text-[var(--pomegranate)]">
            Fix these first — the form will not work yet
          </h2>
          <ul className="flex flex-col gap-1.5 text-[var(--text-sm)]">
            {checks.map((check) => (
              <li key={check.label} className={check.ok ? 'text-[var(--ink-soft)]' : 'text-[var(--pomegranate)]'}>
                {check.ok ? '✓' : '✕'} <strong>{check.label}</strong> — {check.detail}
              </li>
            ))}
          </ul>
          <p className="text-[var(--text-xs)] text-[var(--ink-soft)]">
            After changing environment variables on Vercel you must redeploy — they are baked
            in at build time.
          </p>
        </section>
      )}

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
