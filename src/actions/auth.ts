'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient, getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import {
  signUpSchema, signInSchema, forgotPasswordSchema, resetPasswordSchema, profileSchema,
} from '@/schemas/auth';
import { homeForRole, type Role } from '@/lib/auth/roles';

export type AuthState =
  | { status: 'idle' }
  | { status: 'sent'; email: string; message: string }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const fail = (message: string, fieldErrors?: Record<string, string[]>): AuthState =>
  ({ status: 'error', message, fieldErrors });

async function origin() {
  const h = await headers();
  return h.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

async function limit(bucket: 'auth', userId: string | null = null) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  return checkRateLimit(bucket, rateLimitIdentity(userId, ip));
}

/**
 * Sign up with email and password.
 *
 * Supabase sends the verification email; the account stays
 * `pending_verification` until the link is clicked, and a trigger flips it to
 * `active`. Nothing gates on "has an account" — everything gates on status.
 */
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    accountType: formData.get('accountType') ?? 'customer',
    acceptsTerms: formData.get('acceptsTerms') === 'on',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
    next: formData.get('next') || undefined,
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  if (!isDatabaseConfigured()) return fail('Accounts are not set up yet.');

  const { success } = await limit('auth');
  if (!success) return fail('Too many attempts. Try again in a few minutes.');

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await origin()}/callback?next=${encodeURIComponent(parsed.data.next ?? '/account')}`,
      data: {
        full_name: parsed.data.fullName,
        account_type: parsed.data.accountType,
        marketing_opt_in: parsed.data.marketingOptIn,
      },
    },
  });

  // An "already registered" error tells an attacker the address exists, so
  // the response is identical either way. A real owner gets an email; a
  // prober learns nothing.
  if (error && !/already registered/i.test(error.message)) {
    console.error('[auth] sign-up failed', error.message);
  }

  return {
    status: 'sent',
    email: parsed.data.email,
    message: 'Check your inbox — we have sent a link to confirm your address. It expires in an hour.',
  };
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) return fail('Enter your email and password.');
  if (!isDatabaseConfigured()) return fail('Accounts are not set up yet.');

  const { success } = await limit('auth');
  if (!success) return fail('Too many sign-in attempts. Try again in a few minutes.');

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // One message for wrong password and unknown account alike. Distinct
    // errors turn a login form into an account-enumeration oracle.
    return fail('That email and password do not match an account.');
  }

  const { data: profile } = await supabase
    .from('profiles').select('role, status, suspended_reason').eq('id', data.user.id).maybeSingle();

  const row = profile as unknown as { role: Role; status: string; suspended_reason: string | null } | null;

  if (row?.status === 'suspended' || row?.status === 'banned') {
    await supabase.auth.signOut();
    return fail(
      row.suspended_reason
        ? `This account is suspended: ${row.suspended_reason}`
        : 'This account is suspended. Contact support.',
    );
  }
  if (row?.status === 'pending_verification') {
    return fail('Confirm your email address first — check your inbox for the link.');
  }

  // Login counters are useful for support and for spotting a compromised
  // account, and they must not be writable by the account itself.
  await getSupabaseAdminClient()
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id);

  redirect(parsed.data.next ?? homeForRole(row?.role ?? 'customer'));
}

export async function signInWithProviderAction(formData: FormData) {
  const provider = String(formData.get('provider'));
  if (!['google', 'apple'].includes(provider)) redirect('/sign-in');

  const next = String(formData.get('next') ?? '/account');
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google' | 'apple',
    options: {
      redirectTo: `${await origin()}/callback?next=${encodeURIComponent(next.startsWith('/') ? next : '/account')}`,
    },
  });

  if (error || !data.url) redirect('/sign-in?error=provider');
  redirect(data.url);
}

export async function forgotPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check your email address.');

  const { success } = await limit('auth');
  if (!success) return fail('Too many attempts. Try again in a few minutes.');

  if (isDatabaseConfigured()) {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${await origin()}/reset-password`,
    });
  }

  // Always the same answer, whether or not the address exists.
  return {
    status: 'sent',
    email: parsed.data.email,
    message: 'If that address has an account, a reset link is on its way. It expires in an hour.',
  };
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // The reset link creates a session. Without one, this is someone visiting
  // the URL directly, and there is no account to change.
  if (!user) return fail('That reset link has expired. Request a new one.');

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.message);

  return { status: 'done', message: 'Password updated. You are signed in.' };
}

export async function resendVerificationAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  if (!email) return fail('Enter your email address.');

  const { success } = await limit('auth');
  if (!success) return fail('Too many attempts. Try again shortly.');

  const supabase = await getSupabaseServerClient();
  await supabase.auth.resend({
    type: 'signup', email,
    options: { emailRedirectTo: `${await origin()}/callback?next=/account` },
  });

  return { status: 'sent', email, message: 'Sent. Check your inbox, and your spam folder.' };
}

export async function updateProfileAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    displayName: formData.get('displayName') ?? '',
    phone: formData.get('phone') ?? '',
    preferredLocale: formData.get('preferredLocale'),
    preferredCurrency: formData.get('preferredCurrency'),
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  });
  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Sign in to update your profile.');

  // No role, no status. The RLS policy pins both, so including them here
  // would fail anyway — leaving them out makes the intent explicit.
  const { error } = await supabase.from('profiles').update({
    full_name: parsed.data.fullName,
    display_name: parsed.data.displayName || null,
    phone: parsed.data.phone || null,
    preferred_locale: parsed.data.preferredLocale,
    preferred_currency: parsed.data.preferredCurrency,
    marketing_opt_in: parsed.data.marketingOptIn,
  }).eq('id', user.id);

  if (error) return fail('Could not save your profile.');
  return { status: 'done', message: 'Profile updated.' };
}

export async function signOutAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
