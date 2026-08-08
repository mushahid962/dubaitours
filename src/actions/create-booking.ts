'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { createBookingSchema } from '@/schemas/booking';
import { createBookingDraft } from '@/services/booking-service';
import { BookingError } from '@/services/pricing';
import { routes } from '@/lib/seo/routes';

export type BookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: string; message: string; fieldErrors?: Record<string, string[]> };

/**
 * Checkout entry point. Runs on the server, so the browser never sees a
 * price it can change or a Supabase key it can misuse.
 */
export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = createBookingSchema.safeParse({
    items: JSON.parse(String(formData.get('items') ?? '[]')),
    guest: {
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      countryCode: formData.get('countryCode') || undefined,
    },
    couponCode: formData.get('couponCode') || undefined,
    applyWallet: formData.get('applyWallet') === 'on',
    locale: formData.get('locale') ?? 'en',
    currency: formData.get('currency') ?? 'AED',
    idempotencyKey: formData.get('idempotencyKey'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      code: 'VALIDATION',
      message: 'Check the highlighted fields and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const limit = await checkRateLimit('checkout', rateLimitIdentity(auth.user?.id ?? null, ip));
  if (!limit.success) {
    return {
      status: 'error',
      code: 'RATE_LIMITED',
      message: 'Too many checkout attempts. Wait a minute and try again.',
    };
  }

  let reference: string;
  try {
    const draft = await createBookingDraft(
      supabase,
      getSupabaseAdminClient(),
      parsed.data,
      auth.user?.id ?? null,
    );
    reference = draft.reference;
  } catch (error) {
    if (error instanceof BookingError) {
      return { status: 'error', code: error.code, message: error.message };
    }
    console.error('[checkout] draft failed', error);
    return {
      status: 'error',
      code: 'UNEXPECTED',
      message: 'We couldn’t hold those places. Nothing was charged — please try again.',
    };
  }

  redirect(routes.checkout(parsed.data.locale, reference));
}
