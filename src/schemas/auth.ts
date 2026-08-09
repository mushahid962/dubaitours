import { z } from 'zod';

/**
 * Password rules.
 *
 * Length over composition. NIST dropped the "one uppercase, one symbol"
 * advice years ago because it pushes people towards Password1! and away from
 * long passphrases. Twelve characters and a check against the obvious
 * choices does more real work.
 */
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'letmein123', 'welcome123', 'admin12345', 'iloveyou1', 'dubai12345', 'travelhub',
]);

export const passwordSchema = z.string()
  .min(12, 'Use at least 12 characters — length matters more than symbols.')
  .max(200, 'That is longer than we can store.')
  .refine((value) => !COMMON.has(value.toLowerCase()), 'That password is too common to be safe.')
  .refine((value) => !/^(.)\1+$/.test(value), 'That is the same character repeated.');

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Tell us your name.').max(120),
  email: z.string().email('Enter a valid email address.').max(160),
  password: passwordSchema,
  confirmPassword: z.string(),
  accountType: z.enum(['customer', 'business']).default('customer'),
  acceptsTerms: z.literal(true, { message: 'Accept the terms to create an account.' }),
  marketingOptIn: z.coerce.boolean().default(false),
  next: z.string().startsWith('/').max(300).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Those passwords do not match.', path: ['confirmPassword'],
});

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().startsWith('/').max(300).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter the email address on your account.'),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Those passwords do not match.', path: ['confirmPassword'],
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  phone: z.string().trim().max(24).optional().or(z.literal('')),
  preferredLocale: z.enum(['en', 'ar', 'hi', 'ur']),
  preferredCurrency: z.enum(['AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD', 'EUR', 'GBP', 'INR']),
  marketingOptIn: z.coerce.boolean().default(false),
});

export const assignRoleSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum([
    'customer', 'business_owner', 'business_staff', 'tour_operator', 'hotel_manager',
    'content_manager', 'booking_manager', 'support_agent', 'admin', 'super_admin',
  ]),
  reason: z.string().trim().min(5, 'Record why — this is an audited change.').max(500),
});

export const accountStatusSchema = z.object({
  profileId: z.string().uuid(),
  status: z.enum(['pending_verification', 'active', 'suspended', 'deactivated', 'banned']),
  reason: z.string().trim().max(500).optional(),
}).refine((d) => !['suspended', 'banned'].includes(d.status) || (d.reason?.trim().length ?? 0) >= 5, {
  message: 'A reason is required when suspending or banning.', path: ['reason'],
});
