import { z } from 'zod';

/**
 * What an operator submits to be listed.
 *
 * The document fields are required, not optional. A marketplace that lists
 * unverified operators is one refund scandal away from losing the suppliers
 * who did their paperwork.
 */
export const companyApplicationDraftSchema = z.object({
  legalName: z.string().trim().min(3, 'Enter the name on your trade licence.').max(160),
  displayName: z.string().trim().min(2, 'Enter the name travellers will see.').max(80),
  countryId: z.string().uuid('Choose the country you operate in.'),
  cityId: z.string().uuid().nullable().optional(),
  contactEmail: z.string().email('Enter an email we can reach you on.'),
  contactPhone: z.string().trim().min(7, 'Enter a phone number including country code.').max(24),
  whatsapp: z.string().trim().max(24).optional().or(z.literal('')),
  website: z.string().url('Enter a full URL, including https://').optional().or(z.literal('')),
  about: z.string().trim()
    .min(120, 'Tell travellers what you run, where, and since when — at least 120 characters.')
    .max(2000),
  yearsOperating: z.coerce.number().int().min(0).max(100),
  tourCountEstimate: z.coerce.number().int().min(1).max(500),
  categories: z.array(z.string().uuid()).min(1, 'Choose at least one category.').max(10),

  tradeLicenseNo: z.string().trim().min(3, 'Enter your trade licence number.').max(60),
  tradeLicenseUrl: z.string().min(1, 'Upload your trade licence.'),
  taxRegistrationNo: z.string().trim().max(60).optional().or(z.literal('')),
  insuranceUrl: z.string().optional().or(z.literal('')),
  tourismPermitUrl: z.string().optional().or(z.literal('')),
});

export const submitApplicationSchema = companyApplicationDraftSchema.extend({
  applicationId: z.string().uuid(),
  acceptsTerms: z.literal(true, { message: 'Accept the partner terms to continue.' }),
  confirmsAccuracy: z.literal(true, { message: 'Confirm the details are accurate.' }),
});

export const reviewApplicationSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    applicationId: z.string().uuid(),
    commissionRate: z.coerce.number().min(0).max(50),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    decision: z.literal('reject'),
    applicationId: z.string().uuid(),
    // Required, because "rejected" with no reason generates a support ticket
    // and a reapplication with the same gap.
    reason: z.string().trim().min(10, 'Tell the applicant what was missing.').max(1000),
  }),
  z.object({
    decision: z.literal('request_info'),
    applicationId: z.string().uuid(),
    message: z.string().trim().min(10, 'Say exactly what you need.').max(1000),
  }),
]);

export type CompanyApplicationDraft = z.infer<typeof companyApplicationDraftSchema>;
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;
