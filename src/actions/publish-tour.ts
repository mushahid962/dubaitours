'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { invalidateTags } from '@/lib/cache/redis';
import { routes } from '@/lib/seo/routes';
import { LOCALES } from '@/lib/i18n/config';

/**
 * Publishes a tour and clears every cache that could still be serving the old
 * version. Both layers have to be cleared, in this order — Redis first, then
 * the Next data cache. Reversed, Next could re-populate from a stale Redis
 * entry in the window between the two calls.
 *
 * Authorisation is not checked here on purpose: RLS refuses the update unless
 * the caller is a member of the owning company or is staff. A failed update
 * returns zero rows and nothing is revalidated.
 */
export async function publishTourAction(tourId: string) {
  const supabase = await getSupabaseServerClient();

  const { data: tour, error } = await supabase
    .from('tours')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', tourId)
    .select('id, city:cities!inner ( translations:city_translations ( slug, locale ) )')
    .maybeSingle();

  if (error) return { ok: false as const, message: 'That tour could not be published. Check the required fields.' };
  if (!tour) return { ok: false as const, message: 'You do not have access to that tour.' };

  const { data: translations } = await supabase
    .from('tour_translations')
    .select('slug, locale')
    .eq('tour_id', tourId);

  const slugs = translations ?? [];

  await invalidateTags(...slugs.map((t) => `tour:${t.slug}`), 'sitemap');

  for (const translation of slugs) {
    revalidateTag(`tour:${translation.slug}`, 'max');
    revalidatePath(routes.tour(translation.locale as never, translation.slug));
  }

  // The listing pages that now need to include this tour.
  const city = tour.city as never as { translations: Array<{ slug: string; locale: string }> };
  for (const locale of LOCALES) {
    const citySlug = city.translations.find((t) => t.locale === locale)?.slug;
    if (citySlug) revalidateTag(`city:${citySlug}`, 'max');
  }

  return { ok: true as const, slugs: slugs.map((t) => t.slug) };
}

/**
 * Unpublishing has to be immediate and total — a paused tour that keeps
 * taking bookings from a cached page is a refund and an angry supplier.
 */
export async function unpublishTourAction(tourId: string, reason?: string) {
  const supabase = await getSupabaseServerClient();

  const { data: translations } = await supabase
    .from('tour_translations').select('slug, locale').eq('tour_id', tourId);

  const { error } = await supabase
    .from('tours')
    .update({ status: 'paused', rejected_reason: reason ?? null })
    .eq('id', tourId);

  if (error) return { ok: false as const, message: 'That tour could not be paused.' };

  await invalidateTags(...(translations ?? []).map((t) => `tour:${t.slug}`), 'sitemap');
  for (const translation of translations ?? []) {
    revalidateTag(`tour:${translation.slug}`, 'max');
    revalidatePath(routes.tour(translation.locale as never, translation.slug));
  }

  return { ok: true as const };
}
