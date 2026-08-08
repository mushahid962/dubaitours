'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, can } from '@/lib/auth/session';
import { invalidateTags } from '@/lib/cache/redis';
import {
  tourBasicsSchema, tourContentSchema, tourSeoSchema, tourFaqSchema,
  optionPricingSchema, availabilitySchema,
} from '@/schemas/tour-editor';

export type EditorState =
  | { status: 'idle' }
  | { status: 'saved'; message: string; tourId?: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const fail = (message: string, fieldErrors?: Record<string, string[]>): EditorState =>
  ({ status: 'error', message, fieldErrors });

/** Creates or updates the structural fields of a listing. */
export async function saveTourBasicsAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const actor = await getActor();
  if (!actor) return fail('Sign in to edit this listing.');

  const parsed = tourBasicsSchema.safeParse({
    tourId: formData.get('tourId') || undefined,
    companyId: formData.get('companyId'),
    cityId: formData.get('cityId'),
    primaryCategoryId: formData.get('primaryCategoryId'),
    tourType: formData.get('tourType'),
    confirmation: formData.get('confirmation'),
    cancellation: formData.get('cancellation'),
    durationMinutes: formData.get('durationMinutes'),
    minPax: formData.get('minPax') || 1,
    maxPax: formData.get('maxPax') || null,
    minAge: formData.get('minAge') || null,
    pickupIncluded: formData.get('pickupIncluded') === 'on',
    familyFriendly: formData.get('familyFriendly') === 'on',
    isPrivate: formData.get('isPrivate') === 'on',
    isLuxury: formData.get('isLuxury') === 'on',
    guideLocales: formData.getAll('guideLocales'),
    dayParts: formData.getAll('dayParts'),
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  if (!can(actor, parsed.data.companyId, 'tours.write')) {
    return fail('You do not have permission to edit listings for this operator.');
  }

  const supabase = await getSupabaseServerClient();
  const row = {
    company_id: parsed.data.companyId,
    city_id: parsed.data.cityId,
    primary_category_id: parsed.data.primaryCategoryId,
    tour_type: parsed.data.tourType,
    confirmation: parsed.data.confirmation,
    cancellation: parsed.data.cancellation,
    duration_minutes: parsed.data.durationMinutes,
    min_pax: parsed.data.minPax,
    max_pax: parsed.data.maxPax ?? null,
    min_age: parsed.data.minAge ?? null,
    pickup_included: parsed.data.pickupIncluded,
    family_friendly: parsed.data.familyFriendly,
    is_private: parsed.data.isPrivate,
    is_luxury: parsed.data.isLuxury,
    guide_locales: parsed.data.guideLocales,
    day_parts: parsed.data.dayParts,
  };

  const { data, error } = parsed.data.tourId
    ? await supabase.from('tours').update(row).eq('id', parsed.data.tourId).select('id').maybeSingle()
    : await supabase.from('tours').insert({ ...row, status: 'draft', created_by: actor.id })
        .select('id').maybeSingle();

  if (error) return fail(cleanError(error.message));
  if (!data) return fail('That listing could not be saved.');

  const tourId = String((data as { id: string }).id);
  revalidatePath('/dashboard');
  return { status: 'saved', message: 'Saved.', tourId };
}

/** Saves the traveller-facing copy for one language. */
export async function saveTourContentAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const actor = await getActor();
  if (!actor) return fail('Sign in to edit this listing.');

  const parsed = tourContentSchema.safeParse({
    tourId: formData.get('tourId'),
    locale: formData.get('locale'),
    title: formData.get('title'),
    summary: formData.get('summary') ?? '',
    description: formData.get('description'),
    highlights: splitLines(formData.get('highlights')),
    inclusions: splitLines(formData.get('inclusions')),
    exclusions: splitLines(formData.get('exclusions')),
    whatToBring: splitLines(formData.get('whatToBring')),
    knowBeforeYouGo: formData.get('knowBeforeYouGo') ?? '',
    meetingInstructions: formData.get('meetingInstructions') ?? '',
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();

  // The slug is only generated on first save. Changing it later breaks every
  // inbound link and every ranking the page has earned, so it moves to the
  // SEO tab where the consequence can be spelled out.
  const { data: existing } = await supabase
    .from('tour_translations').select('slug')
    .eq('tour_id', parsed.data.tourId).eq('locale', parsed.data.locale).maybeSingle();

  const slug = (existing as { slug?: string } | null)?.slug ?? slugify(parsed.data.title);

  const { error } = await supabase.from('tour_translations').upsert({
    tour_id: parsed.data.tourId,
    locale: parsed.data.locale,
    slug,
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    description: parsed.data.description,
    highlights: parsed.data.highlights,
    inclusions: parsed.data.inclusions,
    exclusions: parsed.data.exclusions,
    what_to_bring: parsed.data.whatToBring,
    know_before_you_go: parsed.data.knowBeforeYouGo || null,
    meeting_instructions: parsed.data.meetingInstructions || null,
  }, { onConflict: 'tour_id,locale' });

  if (error) {
    if (error.code === '23505') return fail('Another listing already uses that URL. Change the title slightly.');
    return fail(cleanError(error.message));
  }

  await invalidateTags(`tour:${slug}`);
  revalidateTag(`tour:${slug}`, 'max');
  return { status: 'saved', message: 'Content saved.' };
}

/** Slug and meta tags. Kept separate because changing a slug has consequences. */
export async function saveTourSeoAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const parsed = tourSeoSchema.safeParse({
    tourId: formData.get('tourId'),
    locale: formData.get('locale'),
    slug: formData.get('slug'),
    metaTitle: formData.get('metaTitle') ?? '',
    metaDescription: formData.get('metaDescription') ?? '',
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();

  const { data: current } = await supabase
    .from('tour_translations').select('slug')
    .eq('tour_id', parsed.data.tourId).eq('locale', parsed.data.locale).maybeSingle();

  const oldSlug = (current as { slug?: string } | null)?.slug;

  const { error } = await supabase.from('tour_translations').update({
    slug: parsed.data.slug,
    meta_title: parsed.data.metaTitle || null,
    meta_description: parsed.data.metaDescription || null,
  }).eq('tour_id', parsed.data.tourId).eq('locale', parsed.data.locale);

  if (error) {
    if (error.code === '23505') return fail('That URL is already taken by another listing.');
    return fail(cleanError(error.message));
  }

  // A changed slug leaves the old URL dead. Recording a 301 preserves the
  // rankings and any links pointing at it — skipping this is how a rebrand
  // quietly costs a page all its traffic.
  if (oldSlug && oldSlug !== parsed.data.slug) {
    await supabase.from('redirects').upsert({
      from_path: `/tour/${oldSlug}`,
      to_path: `/tour/${parsed.data.slug}`,
      status_code: 301,
    }, { onConflict: 'from_path' });
    await invalidateTags(`tour:${oldSlug}`);
    revalidateTag(`tour:${oldSlug}`, 'max');
  }

  await invalidateTags(`tour:${parsed.data.slug}`, 'sitemap');
  revalidateTag(`tour:${parsed.data.slug}`, 'max');
  return { status: 'saved', message: oldSlug !== parsed.data.slug ? 'Saved. A redirect from the old URL is in place.' : 'SEO saved.' };
}

export async function saveTourFaqsAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const raw = formData.get('faqs');
  let parsedJson: unknown = [];
  try { parsedJson = JSON.parse(String(raw ?? '[]')); } catch { return fail('Could not read those FAQs.'); }

  const parsed = tourFaqSchema.safeParse({
    tourId: formData.get('tourId'), locale: formData.get('locale'), faqs: parsedJson,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check your FAQs.');

  const supabase = await getSupabaseServerClient();
  await supabase.from('tour_faqs').delete().eq('tour_id', parsed.data.tourId).eq('source', 'supplier');

  for (const [index, faq] of parsed.data.faqs.entries()) {
    const { data } = await supabase.from('tour_faqs')
      .insert({ tour_id: parsed.data.tourId, position: index, source: 'supplier' })
      .select('id').maybeSingle();
    if (data) {
      await supabase.from('tour_faq_translations').insert({
        faq_id: (data as { id: string }).id, locale: parsed.data.locale,
        question: faq.question, answer: faq.answer,
      });
    }
  }

  return { status: 'saved', message: `${parsed.data.faqs.length} FAQs saved.` };
}

/** Creates or updates a bookable option and its prices. */
export async function saveOptionAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  let prices: unknown = [];
  try { prices = JSON.parse(String(formData.get('prices') ?? '[]')); } catch { return fail('Could not read those prices.'); }

  const parsed = optionPricingSchema.safeParse({
    tourId: formData.get('tourId'),
    optionId: formData.get('optionId') || undefined,
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    maxPax: formData.get('maxPax') || null,
    isPrivate: formData.get('isPrivate') === 'on',
    currency: formData.get('currency'),
    prices,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the pricing.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();

  const { data: option, error } = parsed.data.optionId
    ? await supabase.from('tour_options').update({
        code: parsed.data.code, max_pax: parsed.data.maxPax ?? null, is_private: parsed.data.isPrivate,
      }).eq('id', parsed.data.optionId).select('id').maybeSingle()
    : await supabase.from('tour_options').insert({
        tour_id: parsed.data.tourId, code: parsed.data.code,
        max_pax: parsed.data.maxPax ?? null, is_private: parsed.data.isPrivate,
      }).select('id').maybeSingle();

  if (error) return fail(cleanError(error.message));
  if (!option) return fail('That option could not be saved.');

  const optionId = String((option as { id: string }).id);

  await supabase.from('tour_option_translations').upsert({
    option_id: optionId, locale: 'en',
    name: parsed.data.name, description: parsed.data.description || null,
  }, { onConflict: 'option_id,locale' });

  for (const price of parsed.data.prices) {
    await supabase.from('tour_prices').upsert({
      option_id: optionId, pax: price.pax, currency: parsed.data.currency,
      list_price: price.listPrice, net_price: price.netPrice,
    }, { onConflict: 'option_id,pax,currency' });
  }

  // from_price drives the card, the Offer node and the sort. Recomputing it
  // here keeps the listing page honest the moment a price changes.
  const cheapest = Math.min(...parsed.data.prices.map((p) => p.listPrice));
  await supabase.from('tours').update({ from_price: cheapest, base_currency: parsed.data.currency })
    .eq('id', parsed.data.tourId);

  return { status: 'saved', message: 'Option and prices saved.' };
}

/** Bulk-generates departures across a date range. */
export async function generateAvailabilityAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const parsed = availabilitySchema.safeParse({
    optionId: formData.get('optionId'),
    from: formData.get('from'),
    to: formData.get('to'),
    time: formData.get('time'),
    capacity: formData.get('capacity'),
    weekdays: formData.getAll('weekdays'),
    timezone: formData.get('timezone') || 'Asia/Dubai',
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the dates.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('generate_departures', {
    p_option_id: parsed.data.optionId,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_time: parsed.data.time,
    p_capacity: parsed.data.capacity,
    p_weekdays: parsed.data.weekdays,
    p_timezone: parsed.data.timezone,
  });

  if (error) return fail(cleanError(error.message));

  const created = Number(data ?? 0);
  return {
    status: 'saved',
    message: created === 0
      ? 'Those dates already existed — nothing was changed, and no bookings were affected.'
      : `${created} dates added.`,
  };
}

/** Sends a listing to the review queue. */
export async function submitTourAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const tourId = String(formData.get('tourId') ?? '');
  if (!tourId) return fail('Missing listing.');

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('submit_tour_for_review', { p_tour_id: tourId });

  if (error) return fail(cleanError(error.message));

  revalidatePath('/dashboard');
  return { status: 'saved', message: 'Submitted. We usually review within one working day.' };
}

/** Pause or resume selling. A supplier may do this at any time, without review. */
export async function setTourStatusAction(_prev: EditorState, formData: FormData): Promise<EditorState> {
  const tourId = String(formData.get('tourId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['paused', 'draft', 'archived'].includes(status)) {
    return fail('That status change is not available here.');
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('tours').update({ status }).eq('id', tourId);
  if (error) return fail(cleanError(error.message));

  await invalidateTags('sitemap');
  revalidatePath('/dashboard');
  return { status: 'saved', message: status === 'paused' ? 'Listing paused — it is off sale now.' : 'Listing updated.' };
}

const splitLines = (value: FormDataEntryValue | null) =>
  String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

const slugify = (value: string) =>
  value.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80);

const cleanError = (message: string) => message.replace(/^.*ERROR:\s*/, '').trim();
