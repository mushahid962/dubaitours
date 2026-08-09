import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MailCheck } from 'lucide-react';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getActor } from '@/lib/auth/session';
import { homeForRole } from '@/lib/auth/roles';
import { ResendVerification } from '@/components/auth/resend-verification';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  const actor = await getActor();
  if (!actor) redirect('/sign-in');
  // Already verified — nothing to do here.
  if (actor.status === 'active') redirect(homeForRole(actor.role));

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-20">
      <MailCheck className="h-10 w-10 text-[var(--teal)]" aria-hidden />
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Confirm your email</h1>
      <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
        We sent a link to <strong>{actor.email}</strong>. Until you confirm, you cannot book or
        leave a review — it is how we keep reviews attached to real people.
      </p>
      <ResendVerification email={actor.email ?? ''} />
    </div>
  );
}
