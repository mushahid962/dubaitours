'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, can } from '@/lib/auth/session';
import { invalidateTags } from '@/lib/cache/redis';
import { locationSchema } from '@/schemas/location';

export type LocationState =
  | { status: 'idle' }
  | { status: 'saved'; message: string; locationId?: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const fail = (message: string, fieldErrors?: Record<string, string[]>): LocationState =>
  ({ status: 'error', message, fieldErrors });

export async function saveLocationAction(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const actor = await getActor();
  if (!can(actor, 'settings.write')) {
    return fail('You do not have permission to edit locations.');
  }

  const parsed = locationSchema.safeParse({
    locationId: formData.get('locationId') || undefined,
    locale: formData.get('locale'),
    level: formData.get('level'),
    parentId: formData.get('parentId') || null,
    countryCode: formData.get('countryCode'),
    locationCode: formData.get('locationCode') ?? '',
    timezone: formData.get('timezone'),
    latitude: formData.get('latitude') || null,
    longitude: formData.get('longitude') || null,
    radiusM: formData.get('radiusM') || null,
    name: formData.get('name'),
    slug: formData.get('slug'),
    h1: formData.get('h1') ?? '',
    tagline: formData.get('tagline') ?? '',
    intro: formData.get('intro') ?? '',
    description: formData.get('description') ?? '',
    body: formData.get('body') ?? '',
    metaTitle: formData.get('metaTitle') ?? '',
    metaDescription: formData.get('metaDescription') ?? '',
    canonicalUrl: formData.get('canonicalUrl') ?? '',
    robots: formData.get('robots') || 'index,follow',
    ogTitle: formData.get('ogTitle') ?? '',
    ogDescription: formData.get('ogDescription') ?? '',
    heroImageUrl: formData.get('heroImageUrl') ?? '',
    status: formData.get('status') || 'draft',
    displayOrder: formData.get('displayOrder') || 0,
    isFeatured: formData.get('isFeatured') === 'on',
    isIndexable: formData.get('isIndexable') === 'on',
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const data = parsed.data;
  const supabase = await getSupabaseServerClient();

  const row = {
    parent_id: data.parentId ?? null,
    level: data.level,
    country_code: data.countryCode,
    location_code: data.locationCode || null,
    timezone: data.timezone,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    radius_m: data.radiusM ?? null,
    hero_image_url: data.heroImageUrl || null,
    status: data.status,
    display_order: data.displayOrder,
    is_featured: data.isFeatured,
    is_indexable: data.isIndexable,
  };

  let locationId = data.locationId;

  if (locationId) {
    const { error } = await supabase.from('locations').update(row).eq('id', locationId);
    if (error) return fail(cleanError(error.message));
  } else {
    // `path` is NOT NULL but is rewritten by a trigger the moment the English
    // translation lands. A placeholder derived from the id satisfies the
    // constraint without ever colliding.
    const placeholder = crypto.randomUUID().replace(/-/g, '');
    const { data: created, error } = await supabase
      .from('locations').insert({ ...row, path: placeholder }).select('id').maybeSingle();
    if (error) return fail(cleanError(error.message));
    if (!created) return fail('That location could not be created.');
    locationId = String((created as { id: string }).id);
  }

  // A changed slug orphans the old URL. Record the redirect before saving so
  // rankings and inbound links survive the rename.
  const { data: current } = await supabase
    .from('location_translations').select('slug')
    .eq('location_id', locationId).eq('locale', data.locale).maybeSingle();
  const oldSlug = (current as { slug?: string } | null)?.slug;

  const { error: translationError } = await supabase.from('location_translations').upsert({
    location_id: locationId,
    locale: data.locale,
    name: data.name,
    slug: data.slug,
    h1: data.h1 || null,
    tagline: data.tagline || null,
    intro: data.intro || null,
    description: data.description || null,
    body: data.body || null,
    meta_title: data.metaTitle || null,
    meta_description: data.metaDescription || null,
    canonical_url: data.canonicalUrl || null,
    robots: data.robots,
    og_title: data.ogTitle || null,
    og_description: data.ogDescription || null,
  }, { onConflict: 'location_id,locale' });

  if (translationError) {
    if (translationError.code === '23505') {
      return fail('Another location already uses that slug. Destination URLs are globally unique.',
        { slug: ['Already taken'] });
    }
    return fail(cleanError(translationError.message));
  }

  if (oldSlug && oldSlug !== data.slug) {
    await supabase.from('redirects').upsert({
      from_path: `/destinations/${oldSlug}`,
      to_path: `/destinations/${data.slug}`,
      status_code: 301,
    }, { onConflict: 'from_path' });
  }

  await invalidateTags('sitemap');
  revalidatePath('/destinations');
  revalidatePath(`/destinations/${data.slug}`);
  revalidatePath('/admin/locations');

  return {
    status: 'saved',
    locationId,
    message: oldSlug && oldSlug !== data.slug
      ? 'Saved. A permanent redirect from the old URL is in place.'
      : 'Location saved.',
  };
}

/**
 * Deleting a location with children would orphan them, so this refuses and
 * says so rather than cascading — a cascade here silently removes a whole
 * branch of the site.
 */
export async function deleteLocationAction(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const actor = await getActor();
  if (!can(actor, 'settings.write')) return fail('You do not have permission to delete locations.');

  const locationId = String(formData.get('locationId') ?? '');
  if (!locationId) return fail('Missing location.');

  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from('locations').select('id', { count: 'exact', head: true }).eq('parent_id', locationId);

  if ((count ?? 0) > 0) {
    return fail(`This has ${count} places beneath it. Move or delete those first — deleting here would take the whole branch with it.`);
  }

  const { error } = await supabase.from('locations').delete().eq('id', locationId);
  if (error) return fail(cleanError(error.message));

  await invalidateTags('sitemap');
  revalidatePath('/admin/locations');
  return { status: 'saved', message: 'Location deleted.' };
}

export async function refreshLocationCountsAction(): Promise<LocationState> {
  const actor = await getActor();
  if (!can(actor, 'settings.write')) return fail('You do not have permission.');

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc('refresh_location_counts');
  if (error) return fail(cleanError(error.message));

  revalidatePath('/admin/locations');
  return { status: 'saved', message: `Recounted ${data ?? 0} locations. Indexation is re-evaluated from the new counts.` };
}

const cleanError = (message: string) => message.replace(/^.*ERROR:\s*/, '').trim();
