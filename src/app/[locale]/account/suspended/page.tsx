import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { isLocale } from '@/lib/i18n/config';
import { getActor } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SuspendedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const actor = await getActor();
  if (!actor) redirect('/sign-in');
  if (actor.status !== 'suspended' && actor.status !== 'banned') redirect('/account');

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-20">
      <ShieldAlert className="h-10 w-10 text-[var(--pomegranate)]" aria-hidden />
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">
        This account is {actor.status === 'banned' ? 'closed' : 'suspended'}
      </h1>
      {/* Telling people why is both fairer and fewer support tickets. */}
      {actor.suspendedReason && (
        <p className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_10%,transparent)] p-4 text-[var(--text-sm)] text-[var(--pomegranate)]">
          <strong>Reason:</strong> {actor.suspendedReason}
        </p>
      )}
      <p className="text-[var(--text-base)] text-[var(--ink-soft)]">
        Bookings already confirmed are unaffected — the operator still expects you. If you think
        this is a mistake, reply to any booking email and a person will look at it.
      </p>
    </div>
  );
}
