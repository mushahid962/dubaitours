'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseAdminClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { getActor } from '@/lib/auth/session';

export type EnquiryState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const schema = z.object({
  name: z.string().trim().min(2, 'Tell us your name.').max(120),
  email: z.string().email('We need an email to send options to.'),
  phone: z.string().trim().min(7, 'Include a phone number with country code.').max(24),
  preferredContact: z.enum(['email', 'phone', 'whatsapp']).default('email'),

  // The requirements. This is the product for a lead-gen vertical — a form
  // that collects only "name and message" produces leads nobody can quote on.
  listingId: z.string().uuid().optional(),
  verticalId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  partySize: z.coerce.number().int().min(1, 'How many travellers?').max(200),
  childrenCount: z.coerce.number().int().min(0).max(50).default(0),
  travelDate: z.string().optional().or(z.literal('')),
  flexibleDates: z.coerce.boolean().default(false),
  budgetPerPerson: z.coerce.number().min(0).max(1_000_000).optional(),
  currency: z.enum(['AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD']).default('AED'),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  needsPickup: z.coerce.boolean().default(false),
  pickupLocation: z.string().trim().max(200).optional().or(z.literal('')),
  language: z.string().trim().max(40).optional().or(z.literal('')),

  landingPage: z.string().max(300).optional(),
  // Honeypot. Bots fill every field they find; a human never sees this one.
  website: z.string().max(0, 'Rejected.').optional(),
});

export async function submitEnquiryAction(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const parsed = schema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    preferredContact: formData.get('preferredContact') || 'email',
    listingId: formData.get('listingId') || undefined,
    verticalId: formData.get('verticalId') || undefined,
    cityId: formData.get('cityId') || undefined,
    partySize: formData.get('partySize'),
    childrenCount: formData.get('childrenCount') || 0,
    travelDate: formData.get('travelDate') ?? '',
    flexibleDates: formData.get('flexibleDates') === 'on',
    budgetPerPerson: formData.get('budgetPerPerson') || undefined,
    currency: formData.get('currency') || 'AED',
    message: formData.get('message') ?? '',
    needsPickup: formData.get('needsPickup') === 'on',
    pickupLocation: formData.get('pickupLocation') ?? '',
    language: formData.get('language') ?? '',
    landingPage: formData.get('landingPage') ?? undefined,
    website: formData.get('website') ?? '',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const actor = await getActor();
  const limit = await checkRateLimit('auth', rateLimitIdentity(actor?.id ?? null, ip));
  if (!limit.success) {
    return { status: 'error', message: 'Too many enquiries from here. Try again in a few minutes.' };
  }

  if (!isDatabaseConfigured()) {
    return { status: 'error', message: 'Enquiries are not set up yet.' };
  }

  const data = parsed.data;

  // Service role, because a public form must not hold an insert policy on a
  // commercial table — that is a spam funnel with a database behind it.
  const { error } = await getSupabaseAdminClient().from('leads').insert({
    status: 'new',
    source: data.listingId ? 'contact_form' : 'group_quote',
    name: data.name,
    email: data.email,
    phone: data.phone,
    preferred_contact: data.preferredContact,
    listing_id: data.listingId ?? null,
    vertical_id: data.verticalId ?? null,
    city_id: data.cityId ?? null,
    party_size: data.partySize,
    travel_date: data.travelDate || null,
    estimated_value: data.budgetPerPerson ? data.budgetPerPerson * data.partySize : null,
    currency: data.currency,
    message: data.message || null,
    landing_page: data.landingPage ?? null,
    requirements: {
      children: data.childrenCount,
      flexible_dates: data.flexibleDates,
      budget_per_person: data.budgetPerPerson ?? null,
      needs_pickup: data.needsPickup,
      pickup_location: data.pickupLocation || null,
      preferred_language: data.language || null,
    },
  });

  if (error) {
    console.error('[enquiry] insert failed', error);
    return { status: 'error', message: 'We could not send that just now. Please try again.' };
  }

  return {
    status: 'done',
    message: 'Got it. We will come back with options and prices, usually within one working day.',
  };
}
