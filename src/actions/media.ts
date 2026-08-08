'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, can } from '@/lib/auth/session';
import { invalidateTags } from '@/lib/cache/redis';

export type MediaState =
  | { status: 'idle' }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const altSchema = z.object({
  tourId: z.string().uuid(),
  mediaId: z.string().uuid(),
  locale: z.enum(['en', 'ar', 'hi', 'ur']),
  altText: z.string().trim().min(10, 'Describe the photo in at least 10 characters.').max(160),
});

/**
 * Uploads tour photos.
 *
 * The storage path is {companyId}/{tourId}/{filename}, and the bucket policy
 * checks `is_company_member` against that first segment — so the path is not
 * cosmetic, it is the authorisation boundary. Never build it from anything
 * the client supplied.
 */
export async function uploadTourMediaAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const actor = await getActor();
  if (!actor) return { status: 'error', message: 'Sign in to upload photos.' };

  const tourId = String(formData.get('tourId') ?? '');
  const companyId = String(formData.get('companyId') ?? '');
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

  if (!tourId || !companyId) return { status: 'error', message: 'Missing listing.' };
  if (!can(actor, companyId, 'tours.write')) {
    return { status: 'error', message: 'You cannot add photos to this operator’s listings.' };
  }
  if (!files.length) return { status: 'error', message: 'Choose at least one photo.' };
  if (files.length > 12) return { status: 'error', message: 'Upload up to 12 photos at a time.' };

  const supabase = await getSupabaseServerClient();

  // The tour must belong to the company in the path. Without this check a
  // member of company A could attach photos to company B's listing by
  // supplying their own company id.
  const { data: tour } = await supabase
    .from('tours').select('id, company_id').eq('id', tourId).maybeSingle();
  if (!tour || String((tour as { company_id: string }).company_id) !== companyId) {
    return { status: 'error', message: 'That listing does not belong to this operator.' };
  }

  let uploaded = 0;

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return { status: 'error', message: `${file.name} is over 10 MB. Resize it and try again.` };
    }
    // Trusting the browser's Content-Type alone is weak, but combined with a
    // bucket-level MIME allowlist it is enough to keep scripts out.
    if (!ALLOWED.includes(file.type)) {
      return { status: 'error', message: `${file.name} is not a JPEG, PNG, WebP or AVIF.` };
    }

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'jpg';
    const path = `${companyId}/${tourId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('tour-media')
      .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });

    if (uploadError) {
      console.error('[media] upload failed', uploadError);
      return { status: 'error', message: `Could not upload ${file.name}.` };
    }

    const { data: publicUrl } = supabase.storage.from('tour-media').getPublicUrl(path);

    const { data: asset } = await supabase.from('media_assets').insert({
      kind: 'image', provider: 'supabase', public_id: path,
      url: publicUrl.publicUrl, bytes: file.size, uploaded_by: actor.id,
    }).select('id').maybeSingle();

    if (!asset) continue;

    const { count } = await supabase
      .from('tour_media').select('media_id', { count: 'exact', head: true }).eq('tour_id', tourId);

    await supabase.from('tour_media').insert({
      tour_id: tourId,
      media_id: (asset as { id: string }).id,
      position: count ?? 0,
      // The first photo ever uploaded becomes the cover, so a listing is
      // never left with photos but no card image.
      is_cover: (count ?? 0) === 0,
      alt_text: {},
    });

    uploaded += 1;
  }

  await invalidateTags('sitemap');
  revalidatePath('/dashboard');
  return {
    status: 'done',
    message: `${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded. Add alt text below — it is what makes them show up in Google Images.`,
  };
}

/** Alt text is image SEO and accessibility in one field. */
export async function saveAltTextAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const parsed = altSchema.safeParse({
    tourId: formData.get('tourId'),
    mediaId: formData.get('mediaId'),
    locale: formData.get('locale'),
    altText: formData.get('altText'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the description.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: existing } = await supabase
    .from('tour_media').select('alt_text')
    .eq('tour_id', parsed.data.tourId).eq('media_id', parsed.data.mediaId).maybeSingle();

  const altText = {
    ...((existing as { alt_text?: Record<string, string> } | null)?.alt_text ?? {}),
    [parsed.data.locale]: parsed.data.altText,
  };

  const { error } = await supabase.from('tour_media').update({ alt_text: altText })
    .eq('tour_id', parsed.data.tourId).eq('media_id', parsed.data.mediaId);

  if (error) return { status: 'error', message: 'Could not save that description.' };

  revalidatePath('/dashboard');
  return { status: 'done', message: 'Description saved.' };
}

export async function setCoverAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const tourId = String(formData.get('tourId') ?? '');
  const mediaId = String(formData.get('mediaId') ?? '');

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc('set_tour_cover', { p_tour_id: tourId, p_media_id: mediaId });
  if (error) return { status: 'error', message: error.message.replace(/^.*ERROR:\s*/, '') };

  revalidatePath('/dashboard');
  return { status: 'done', message: 'Cover photo updated.' };
}

export async function deleteMediaAction(_prev: MediaState, formData: FormData): Promise<MediaState> {
  const tourId = String(formData.get('tourId') ?? '');
  const mediaId = String(formData.get('mediaId') ?? '');

  const supabase = await getSupabaseServerClient();

  const { data: link } = await supabase
    .from('tour_media').select('is_cover').eq('tour_id', tourId).eq('media_id', mediaId).maybeSingle();

  const { error } = await supabase.from('tour_media').delete()
    .eq('tour_id', tourId).eq('media_id', mediaId);
  if (error) return { status: 'error', message: 'Could not remove that photo.' };

  // Removing the cover must promote another photo, or the listing card goes
  // blank across every search result and rail on the site.
  if ((link as { is_cover?: boolean } | null)?.is_cover) {
    const { data: next } = await supabase
      .from('tour_media').select('media_id').eq('tour_id', tourId).order('position').limit(1).maybeSingle();
    if (next) {
      await supabase.rpc('set_tour_cover', {
        p_tour_id: tourId, p_media_id: (next as { media_id: string }).media_id,
      });
    }
  }

  revalidatePath('/dashboard');
  return { status: 'done', message: 'Photo removed.' };
}
