'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { z } from 'zod';

export type AuthState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

const signInSchema = z.object({
  email: z.string().email('Enter the email address you booked with.'),
  next: z.string().startsWith('/', 'Invalid redirect').max(300).optional(),
});

/**
 * Email one-time code. No passwords anywhere in this product: nothing to
 * leak, nothing to reuse from another breach, and no reset flow to phish.
 */
export async function signInWithEmailAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    next: formData.get('next') ?? undefined,
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your email address.' };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const limit = await checkRateLimit('auth', rateLimitIdentity(null, ip));
  if (!limit.success) {
    return { status: 'error', message: 'Too many sign-in attempts. Try again in a few minutes.' };
  }

  const origin = requestHeaders.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!;
  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/callback?next=${encodeURIComponent(parsed.data.next ?? '/')}`,
      shouldCreateUser: true,
    },
  });

  // Deliberately identical response whether or not the address has an account.
  // Distinguishing them turns the sign-in form into an account-enumeration API.
  if (error && !/rate limit/i.test(error.message)) {
    console.error('[auth] otp failed', error);
  }

  return { status: 'sent', email: parsed.data.email };
}

export async function signInWithProviderAction(formData: FormData) {
  const provider = String(formData.get('provider'));
  if (!['google', 'apple'].includes(provider)) redirect('/sign-in');

  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!;
  const next = String(formData.get('next') ?? '/');
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google' | 'apple',
    options: { redirectTo: `${origin}/callback?next=${encodeURIComponent(next.startsWith('/') ? next : '/')}` },
  });

  if (error || !data.url) redirect('/sign-in?error=provider');
  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
