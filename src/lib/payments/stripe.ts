import 'server-only';
import Stripe from 'stripe';

/**
 * Stripe, created lazily.
 *
 * Constructing the client at import time would crash every page — including
 * ones with nothing to do with payments — before anyone has added a key.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentsNotConfiguredError(
      'Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.',
    );
  }

  client = new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    // Pinning the version matters: Stripe evolves its API, and an unpinned
    // client silently changes shape underneath a working checkout.
    typescript: true,
    appInfo: { name: 'TravelHub Gulf', version: '0.1.0' },
  });
  return client;
}

export const isPaymentsConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

export class PaymentsNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentsNotConfiguredError';
  }
}

/**
 * Stripe takes amounts as integers in the currency's smallest unit. Most
 * currencies use 2 decimal places, but the Gulf's KWD, BHD and OMR use 3 —
 * so 10 KWD is 10000 fils, not 1000. Getting this wrong undercharges by 10x
 * in three of our six launch markets.
 */
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP']);

export function toStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return Math.round(amount);
  if (THREE_DECIMAL.has(code)) return Math.round(amount * 1000);
  return Math.round(amount * 100);
}

export function fromStripeAmount(minor: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return minor;
  if (THREE_DECIMAL.has(code)) return minor / 1000;
  return minor / 100;
}
