'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';

export type SubscribeState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const schema = z.object({
  email: z.string().email('Enter a valid email address.').max(160),
  locale: z.enum(['en', 'ar', 'hi', 'ur']).default('en'),
});

export async function subscribeAction(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale') ?? 'en',
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check your email address.' };
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const limit = await checkRateLimit('auth', rateLimitIdentity(null, ip));
  if (!limit.success) {
    return { status: 'error', message: 'Too many attempts. Try again in a few minutes.' };
  }

  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'The newsletter is not set up yet.' };
  }

  const { error } = await getSupabaseAdminClient()
    .from('newsletter_subscribers')
    .insert({ email: parsed.data.email, locale: parsed.data.locale, source: 'homepage' });

  // A duplicate is not an error the visitor needs to hear about — and telling
  // them "you're already subscribed" turns this box into a way to test whether
  // a given address is on the list.
  if (error && error.code !== '23505') {
    console.error('[newsletter] insert failed', error);
    return { status: 'error', message: 'We could not sign you up just now. Try again shortly.' };
  }

  return {
    status: 'done',
    message: 'Almost there — check your inbox for a confirmation link.',
  };
}
