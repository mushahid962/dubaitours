import { z } from 'zod';

/** Slugs allow Latin, Arabic and Devanagari so non-English URLs stay native. */
const slugPattern = /^[a-z0-9\u0600-\u06FF\u0900-\u097F]+(?:-[a-z0-9\u0600-\u06FF\u0900-\u097F]+)*$/;

/**
 * Custom JSON-LD.
 *
 * Validated as parseable JSON with an @type before it is stored, because
 * malformed structured data is worse than none — Google reports it as an
 * error against the whole page, and nobody notices for months.
 */
const jsonLdSchema = z.string().trim().optional().or(z.literal('')).superRefine((value, ctx) => {
  if (!value) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'That is not valid JSON. Check for a trailing comma or a missing quote.' });
    return;
  }
  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null || !('@type' in node)) {
      ctx.addIssue({ code: 'custom', message: 'Every schema object needs an "@type" property.' });
      return;
    }
  }
});

/**
 * Custom CSS is injected into a page, so it is checked for the ways a stylesheet
 * can execute script. This is not a full sanitiser — it is a guard against the
 * three vectors that actually appear.
 */
const cssSchema = z.string().trim().max(20000).optional().or(z.literal('')).superRefine((value, ctx) => {
  if (!value) return;
  const banned = [
    { pattern: /<\/?script/i, message: 'Remove the <script> tag — use Header Scripts for JavaScript.' },
    { pattern: /javascript\s*:/i, message: 'javascript: URLs are not allowed in CSS.' },
    { pattern: /expression\s*\(/i, message: 'CSS expression() is not allowed.' },
    { pattern: /@import/i, message: 'Remove @import — it blocks rendering. Paste the CSS directly.' },
  ];
  for (const rule of banned) {
    if (rule.pattern.test(value)) ctx.addIssue({ code: 'custom', message: rule.message });
  }
});

export const postEditorSchema = z.object({
  postId: z.string().uuid().optional(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),

  // Content
  title: z.string().trim().min(10, 'Titles under 10 characters rank poorly.').max(160),
  slug: z.string().trim().min(3).max(90).regex(slugPattern, 'Lowercase words separated by single hyphens.'),
  excerpt: z.string().trim().max(320).optional().or(z.literal('')),
  bodyMdx: z.string().trim().min(1, 'Write something before saving.').max(200000),
  postType: z.enum(['guide', 'listicle', 'news', 'itinerary', 'food', 'culture', 'visa', 'event', 'review']),
  authorId: z.string().uuid('Choose an author — bylines are an E-E-A-T signal, not decoration.'),
  reviewerId: z.string().uuid().nullable().optional(),
  cityId: z.string().uuid().nullable().optional(),
  countryId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),

  // SEO
  metaTitle: z.string().trim().max(70).optional().or(z.literal('')),
  metaDescription: z.string().trim().max(180).optional().or(z.literal('')),
  focusKeyword: z.string().trim().max(80).optional().or(z.literal('')),
  canonicalUrl: z.string().url('Enter a full URL including https://').optional().or(z.literal('')),
  robots: z.enum(['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow']).default('index,follow'),
  ogTitle: z.string().trim().max(90).optional().or(z.literal('')),
  ogDescription: z.string().trim().max(200).optional().or(z.literal('')),

  // Advanced
  customSchema: jsonLdSchema,
  customCss: cssSchema,
  customHead: z.string().trim().max(5000).optional().or(z.literal('')),

  // Publishing
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).default('draft'),
  scheduledFor: z.string().optional().or(z.literal('')),
  isFeatured: z.coerce.boolean().default(false),
  readingMinutes: z.coerce.number().int().min(0).max(180).optional(),
}).superRefine((data, ctx) => {
  if (data.status === 'scheduled') {
    if (!data.scheduledFor) {
      ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'Pick a date and time to publish.' });
    } else if (new Date(data.scheduledFor) <= new Date()) {
      ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'That time has already passed — publish now instead.' });
    }
  }
});

export const menuItemSchema = z.object({
  id: z.string().uuid().optional(),
  menuId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  position: z.coerce.number().int().min(0).max(200),
  href: z.string().trim().min(1).max(300),
  labels: z.record(z.string(), z.string().trim().max(80)),
  icon: z.string().trim().max(40).optional().or(z.literal('')),
  badge: z.string().trim().max(20).optional().or(z.literal('')),
  rel: z.string().trim().max(40).optional().or(z.literal('')),
  isVisible: z.coerce.boolean().default(true),
});

export const themeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour, e.g. #0E6E64'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour'),
  urgent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour'),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour'),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour'),
  radius: z.string().regex(/^\d{1,2}px$/, 'Use a pixel value, e.g. 22px'),
  customCss: cssSchema,
});

export type PostEditorInput = z.infer<typeof postEditorSchema>;
