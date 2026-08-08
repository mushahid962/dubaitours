import { z } from 'zod';

/**
 * What a supplier may set on a listing.
 *
 * Notice what is absent: status, published_at, reviewed_by, rating_avg,
 * booking_count. Those are set by the workflow functions and triggers. A
 * schema that accepts them is a schema that will eventually be used to set
 * them.
 */
export const tourBasicsSchema = z.object({
  tourId: z.string().uuid().optional(),
  companyId: z.string().uuid(),
  cityId: z.string().uuid('Choose the city this runs in.'),
  primaryCategoryId: z.string().uuid('Choose a category.'),
  tourType: z.enum(['private', 'group', 'self_guided', 'ticket_only', 'transfer', 'multi_day']),
  confirmation: z.enum(['instant', 'manual', 'on_request']),
  cancellation: z.enum(['flexible_24h', 'moderate_48h', 'standard_72h', 'strict', 'non_refundable']),
  durationMinutes: z.coerce.number().int().min(15, 'At least 15 minutes.').max(20_160),
  minPax: z.coerce.number().int().min(1).max(100),
  maxPax: z.coerce.number().int().min(1).max(500).nullable().optional(),
  minAge: z.coerce.number().int().min(0).max(99).nullable().optional(),
  pickupIncluded: z.coerce.boolean().default(false),
  familyFriendly: z.coerce.boolean().default(true),
  isPrivate: z.coerce.boolean().default(false),
  isLuxury: z.coerce.boolean().default(false),
  guideLocales: z.array(z.enum(['en', 'ar', 'hi', 'ur'])).min(1, 'Pick at least one guide language.'),
  dayParts: z.array(z.enum(['morning', 'afternoon', 'evening', 'night', 'full_day'])).default([]),
});

export const tourContentSchema = z.object({
  tourId: z.string().uuid(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),
  title: z.string().trim().min(20, 'Titles under 20 characters rank poorly and convert worse.').max(120),
  summary: z.string().trim().max(300).optional().or(z.literal('')),
  description: z.string().trim().min(300, 'Write at least 300 characters — this is the page Google reads.').max(8000),
  highlights: z.array(z.string().trim().min(3).max(160)).min(3, 'Three highlights minimum.').max(10),
  inclusions: z.array(z.string().trim().min(2).max(160)).min(1, 'List what the price covers.').max(20),
  exclusions: z.array(z.string().trim().min(2).max(160)).max(20).default([]),
  whatToBring: z.array(z.string().trim().min(2).max(160)).max(15).default([]),
  knowBeforeYouGo: z.string().trim().max(2000).optional().or(z.literal('')),
  meetingInstructions: z.string().trim().max(1000).optional().or(z.literal('')),
});

/**
 * SEO fields, with the limits that actually matter.
 *
 * Google truncates titles around 60 characters and descriptions around 160.
 * These are warnings in the UI rather than hard errors — a 62-character title
 * is not worth blocking a supplier over — but the schema still caps the
 * absurd cases.
 */
export const tourSeoSchema = z.object({
  tourId: z.string().uuid(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),
  slug: z.string().trim()
    .min(8, 'Slugs need to be descriptive.')
    .max(90, 'Keep slugs under 90 characters.')
    .regex(/^[a-z0-9\u0600-\u06FF\u0900-\u097F]+(?:-[a-z0-9\u0600-\u06FF\u0900-\u097F]+)*$/,
      'Lowercase words separated by single hyphens.'),
  metaTitle: z.string().trim().max(70).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(180).optional().or(z.literal('')),
});

export const tourFaqSchema = z.object({
  tourId: z.string().uuid(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),
  faqs: z.array(z.object({
    question: z.string().trim().min(10).max(200),
    answer: z.string().trim().min(20).max(1200),
  })).max(20),
});

export const optionPricingSchema = z.object({
  tourId: z.string().uuid(),
  optionId: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens.'),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  maxPax: z.coerce.number().int().min(1).max(500).nullable().optional(),
  isPrivate: z.coerce.boolean().default(false),
  currency: z.enum(['AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD']),
  prices: z.array(z.object({
    pax: z.enum(['adult', 'child', 'infant', 'senior', 'student', 'group', 'vehicle']),
    listPrice: z.coerce.number().min(0).max(1_000_000),
    netPrice: z.coerce.number().min(0).max(1_000_000),
  })).min(1, 'Set at least an adult price.'),
}).refine(
  (data) => data.prices.every((price) => price.netPrice <= price.listPrice),
  { message: 'Your net price cannot exceed what the traveller pays.', path: ['prices'] },
);

export const availabilitySchema = z.object({
  optionId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 16:00.'),
  capacity: z.coerce.number().int().min(1).max(5000),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pick at least one day.'),
  timezone: z.string().default('Asia/Dubai'),
});

export type TourBasics = z.infer<typeof tourBasicsSchema>;
export type TourContent = z.infer<typeof tourContentSchema>;
export type TourSeo = z.infer<typeof tourSeoSchema>;
