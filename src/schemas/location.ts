import { z } from 'zod';

/** Latin, Arabic and Devanagari, so non-English slugs stay native script. */
const slugPattern = /^[a-z0-9\u0600-\u06FF\u0900-\u097F]+(?:-[a-z0-9\u0600-\u06FF\u0900-\u097F]+)*$/;

export const LOCATION_LEVELS = [
  'country', 'region', 'city', 'district', 'neighborhood', 'poi',
] as const;

export const locationSchema = z.object({
  locationId: z.string().uuid().optional(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),

  // Hierarchy
  level: z.enum(LOCATION_LEVELS),
  parentId: z.string().uuid().nullable().optional(),
  countryCode: z.string().length(2, 'Two-letter ISO code, e.g. AE').toUpperCase(),
  locationCode: z.string().trim().max(20).optional().or(z.literal('')),
  timezone: z.string().trim().min(3).max(60),

  // Coordinates. Both or neither — a latitude without a longitude is worse
  // than no coordinates, because it silently maps to the Gulf of Guinea.
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  radiusM: z.coerce.number().int().min(0).max(500_000).nullable().optional(),

  // Content
  name: z.string().trim().min(2, 'Enter the place name.').max(120),
  slug: z.string().trim().min(2).max(90).regex(slugPattern, 'Lowercase words separated by single hyphens.'),
  h1: z.string().trim().max(160).optional().or(z.literal('')),
  tagline: z.string().trim().max(200).optional().or(z.literal('')),
  intro: z.string().trim().max(4000).optional().or(z.literal('')),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  body: z.string().trim().max(40000).optional().or(z.literal('')),

  // SEO
  metaTitle: z.string().trim().max(70).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(180).optional().or(z.literal('')),
  canonicalUrl: z.string().url('Enter a full URL including https://').optional().or(z.literal('')),
  robots: z.enum(['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'])
    .default('index,follow'),
  ogTitle: z.string().trim().max(90).optional().or(z.literal('')),
  ogDescription: z.string().trim().max(200).optional().or(z.literal('')),

  // Presentation and control
  heroImageUrl: z.string().url().optional().or(z.literal('')),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).default('draft'),
  displayOrder: z.coerce.number().int().min(-999).max(999).default(0),
  isFeatured: z.coerce.boolean().default(false),
  isIndexable: z.coerce.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.level !== 'country' && !data.parentId) {
    ctx.addIssue({
      code: 'custom', path: ['parentId'],
      message: 'Everything below country level needs a parent.',
    });
  }
  if (data.level === 'country' && data.parentId) {
    ctx.addIssue({
      code: 'custom', path: ['parentId'],
      message: 'A country sits at the root and cannot have a parent.',
    });
  }
  const hasLat = data.latitude !== null && data.latitude !== undefined;
  const hasLng = data.longitude !== null && data.longitude !== undefined;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: 'custom', path: ['longitude'],
      message: 'Give both latitude and longitude, or neither.',
    });
  }
});

export type LocationInput = z.infer<typeof locationSchema>;
