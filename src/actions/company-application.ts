'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor } from '@/lib/auth/session';
import { checkRateLimit, rateLimitIdentity } from '@/lib/cache/rate-limit';
import { companyApplicationDraftSchema, submitApplicationSchema } from '@/schemas/company-application';

export type ApplicationState =
  | { status: 'idle' }
  | { status: 'saved'; applicationId: string }
  | { status: 'submitted'; applicationId: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

/**
 * Saves a partner application draft. Runs as the applicant, so RLS enforces
 * that they can only write their own row — no company_id check is needed
 * here, because the policy already refuses anything else.
 */
export async function saveApplicationDraftAction(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const actor = await getActor();
  if (!actor) return { status: 'error', message: 'Sign in to continue your application.' };

  const parsed = companyApplicationDraftSchema.safeParse({
    legalName: formData.get('legalName'),
    displayName: formData.get('displayName'),
    countryId: formData.get('countryId'),
    cityId: formData.get('cityId') || null,
    contactEmail: formData.get('contactEmail'),
    contactPhone: formData.get('contactPhone'),
    whatsapp: formData.get('whatsapp') ?? '',
    website: formData.get('website') ?? '',
    about: formData.get('about'),
    yearsOperating: formData.get('yearsOperating'),
    tourCountEstimate: formData.get('tourCountEstimate'),
    categories: formData.getAll('categories'),
    tradeLicenseNo: formData.get('tradeLicenseNo'),
    tradeLicenseUrl: formData.get('tradeLicenseUrl'),
    taxRegistrationNo: formData.get('taxRegistrationNo') ?? '',
    insuranceUrl: formData.get('insuranceUrl') ?? '',
    tourismPermitUrl: formData.get('tourismPermitUrl') ?? '',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await getSupabaseServerClient();
  const existingId = formData.get('applicationId');

  const row = {
    submitted_by: actor.id,
    legal_name: parsed.data.legalName,
    display_name: parsed.data.displayName,
    country_id: parsed.data.countryId,
    city_id: parsed.data.cityId ?? null,
    contact_email: parsed.data.contactEmail,
    contact_phone: parsed.data.contactPhone,
    whatsapp: parsed.data.whatsapp || null,
    website: parsed.data.website || null,
    about: parsed.data.about,
    years_operating: parsed.data.yearsOperating,
    tour_count_estimate: parsed.data.tourCountEstimate,
    categories: parsed.data.categories,
    trade_license_no: parsed.data.tradeLicenseNo,
    trade_license_url: parsed.data.tradeLicenseUrl,
    tax_registration_no: parsed.data.taxRegistrationNo || null,
    insurance_url: parsed.data.insuranceUrl || null,
    tourism_permit_url: parsed.data.tourismPermitUrl || null,
  };

  const query = existingId
    ? supabase.from('company_applications').update(row).eq('id', String(existingId)).select('id').maybeSingle()
    : supabase.from('company_applications').insert(row).select('id').maybeSingle();

  const { data, error } = await query;

  if (error) {
    // The partial unique index means one open application per person.
    if (error.code === '23505') {
      return { status: 'error', message: 'You already have an application in progress. Open it from your account.' };
    }
    return { status: 'error', message: 'That draft could not be saved. Try again in a moment.' };
  }
  if (!data) return { status: 'error', message: 'That application is no longer editable.' };

  return { status: 'saved', applicationId: data.id };
}

/**
 * Submits the application for review. The state change happens inside
 * `submit_company_application`, which re-checks ownership and the required
 * documents — the applicant cannot write `status` by any other route.
 */
export async function submitApplicationAction(
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const actor = await getActor();
  if (!actor) return { status: 'error', message: 'Sign in to submit your application.' };

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const limit = await checkRateLimit('auth', rateLimitIdentity(actor.id, ip));
  if (!limit.success) {
    return { status: 'error', message: 'Too many attempts. Try again in a few minutes.' };
  }

  const saved = await saveApplicationDraftAction({ status: 'idle' }, formData);
  // Narrow to the one state that carries an id — the others mean the draft
  // never persisted, so there is nothing to submit.
  if (saved.status !== 'saved') {
    return saved.status === 'error'
      ? saved
      : { status: 'error', message: 'That draft could not be saved. Try again.' };
  }

  const parsed = submitApplicationSchema.pick({ acceptsTerms: true, confirmsAccuracy: true }).safeParse({
    acceptsTerms: formData.get('acceptsTerms') === 'on',
    confirmsAccuracy: formData.get('confirmsAccuracy') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Accept the partner terms and confirm your details.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('submit_company_application', {
    p_application_id: saved.applicationId,
  });

  if (error) {
    return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };
  }

  revalidatePath('/partner/apply');
  return { status: 'submitted', applicationId: saved.applicationId };
}
