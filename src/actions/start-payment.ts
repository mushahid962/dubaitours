'use server';

import { redirect } from 'next/navigation';
import { getBookingForCheckout, createCheckoutSession, CheckoutError } from '@/services/checkout-service';
import { PaymentsNotConfiguredError } from '@/lib/payments/stripe';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export type PaymentState = { status: 'idle' } | { status: 'error'; code: string; message: string };

/**
 * Hands the traveller to Stripe. Deliberately takes only a reference and
 * re-loads everything server-side — a form field carrying an amount is a
 * form field someone will edit.
 */
export async function startPaymentAction(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const reference = String(formData.get('reference') ?? '').trim().toUpperCase();
  const rawLocale = String(formData.get('locale') ?? DEFAULT_LOCALE);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  if (!/^THG-[A-Z0-9]{8}$/.test(reference)) {
    return { status: 'error', code: 'BAD_REFERENCE', message: 'That booking reference looks wrong.' };
  }

  let url: string;
  try {
    const booking = await getBookingForCheckout(reference, locale);
    if (!booking) {
      return { status: 'error', code: 'NOT_FOUND', message: 'We could not find that booking.' };
    }
    ({ url } = await createCheckoutSession(booking, locale));
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { status: 'error', code: error.code, message: error.message };
    }
    if (error instanceof PaymentsNotConfiguredError) {
      return {
        status: 'error',
        code: 'NOT_CONFIGURED',
        message: 'Payments are not set up yet. Add your Stripe keys — see Part 4 of the setup guide.',
      };
    }
    console.error('[payment] session failed', error);
    return {
      status: 'error',
      code: 'UNEXPECTED',
      message: 'We could not start the payment. Nothing was charged — please try again.',
    };
  }

  redirect(url);
}
