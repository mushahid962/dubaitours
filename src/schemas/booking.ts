import { z } from 'zod';

export const PAX_TYPES = ['adult', 'child', 'infant', 'senior', 'student', 'group', 'vehicle'] as const;

export const paxBreakdownSchema = z
  .record(z.enum(PAX_TYPES), z.number().int().min(0).max(30))
  .refine((value) => Object.values(value).reduce((sum, n) => sum + n, 0) > 0, {
    message: 'Select at least one traveller.',
  })
  .refine((value) => (value.adult ?? 0) + (value.senior ?? 0) + (value.student ?? 0) > 0, {
    message: 'At least one adult must accompany the booking.',
  });

export const cartItemSchema = z.object({
  tourId: z.string().uuid(),
  optionId: z.string().uuid(),
  departureId: z.string().uuid(),
  pax: paxBreakdownSchema,
  pickupPointId: z.string().uuid().nullable().optional(),
  pickupNote: z.string().max(280).optional(),
});

export const travellerSchema = z.object({
  pax: z.enum(PAX_TYPES),
  fullName: z.string().min(2).max(120),
  age: z.number().int().min(0).max(120).optional(),
  nationality: z.string().length(2).optional(),
  passportNo: z.string().max(40).optional(),
});

export const guestDetailsSchema = z.object({
  fullName: z.string().min(2, 'Enter the lead traveller’s full name.').max(120),
  email: z.string().email('Enter an email we can send the ticket to.'),
  phone: z.string().min(7, 'Enter a phone number the operator can reach.').max(24),
  countryCode: z.string().length(2).optional(),
});

export const createBookingSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(10),
  guest: guestDetailsSchema,
  travellers: z.array(travellerSchema).max(60).optional(),
  couponCode: z.string().trim().min(3).max(32).optional(),
  applyWallet: z.boolean().default(false),
  locale: z.enum(['en', 'ar', 'hi', 'ur']).default('en'),
  currency: z.enum(['AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD', 'EUR', 'GBP', 'INR']).default('AED'),
  /** Prevents a double-submitted form from creating two bookings. */
  idempotencyKey: z.string().uuid(),
  utm: z.record(z.string(), z.string().max(120)).optional(),
  affiliateRef: z.string().max(64).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type PaxBreakdown = z.infer<typeof paxBreakdownSchema>;
