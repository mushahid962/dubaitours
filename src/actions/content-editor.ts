'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getActor, isStaff } from '@/lib/auth/session';
import { invalidateTags } from '@/lib/cache/redis';
import { postEditorSchema, themeSchema } from '@/schemas/content';

export type ContentState =
  | { status: 'idle' }
  | { status: 'saved'; message: string; postId?: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[]> };

const fail = (message: string, fieldErrors?: Record<string, string[]>): ContentState =>
  ({ status: 'error', message, fieldErrors });

export async function savePostAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await getActor();
  if (!isStaff(actor)) return fail('You do not have permission to edit content.');

  const parsed = postEditorSchema.safeParse({
    postId: formData.get('postId') || undefined,
    locale: formData.get('locale'),
    title: formData.get('title'),
    slug: formData.get('slug'),
    excerpt: formData.get('excerpt') ?? '',
    bodyMdx: formData.get('bodyMdx'),
    postType: formData.get('postType'),
    authorId: formData.get('authorId'),
    reviewerId: formData.get('reviewerId') || null,
    cityId: formData.get('cityId') || null,
    countryId: formData.get('countryId') || null,
    coverMediaId: formData.get('coverMediaId') || null,
    tags: String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    metaTitle: formData.get('metaTitle') ?? '',
    metaDescription: formData.get('metaDescription') ?? '',
    focusKeyword: formData.get('focusKeyword') ?? '',
    canonicalUrl: formData.get('canonicalUrl') ?? '',
    robots: formData.get('robots') || 'index,follow',
    ogTitle: formData.get('ogTitle') ?? '',
    ogDescription: formData.get('ogDescription') ?? '',
    customSchema: formData.get('customSchema') ?? '',
    customCss: formData.get('customCss') ?? '',
    customHead: formData.get('customHead') ?? '',
    status: formData.get('status') || 'draft',
    scheduledFor: formData.get('scheduledFor') ?? '',
    isFeatured: formData.get('isFeatured') === 'on',
    readingMinutes: formData.get('readingMinutes') || undefined,
  });

  if (!parsed.success) {
    return fail('Check the highlighted fields.', parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const data = parsed.data;
  const supabase = await getSupabaseServerClient();

  // Reading time is computed rather than typed. 220 wpm is a reasonable
  // average, and an author's guess is always wrong in the optimistic direction.
  const words = data.bodyMdx.trim().split(/\s+/).length;
  const readingMinutes = data.readingMinutes ?? Math.max(1, Math.round(words / 220));

  const postRow = {
    author_id: data.authorId,
    reviewer_id: data.reviewerId ?? null,
    status: data.status,
    post_type: data.postType,
    city_id: data.cityId ?? null,
    country_id: data.countryId ?? null,
    cover_media_id: data.coverMediaId ?? null,
    reading_minutes: readingMinutes,
    custom_css: data.customCss || null,
    custom_schema: data.customSchema ? JSON.parse(data.customSchema) : null,
    custom_head: data.customHead || null,
    scheduled_for: data.status === 'scheduled' && data.scheduledFor
      ? new Date(data.scheduledFor).toISOString() : null,
    is_featured: data.isFeatured,
    updated_by: actor!.id,
    published_at: data.status === 'published' ? new Date().toISOString() : null,
  };

  const { data: post, error } = data.postId
    ? await supabase.from('blog_posts').update(postRow).eq('id', data.postId).select('id').maybeSingle()
    : await supabase.from('blog_posts').insert(postRow).select('id').maybeSingle();

  if (error) return fail(cleanError(error.message));
  if (!post) return fail('That post could not be saved.');

  const postId = String((post as { id: string }).id);

  // A changed slug leaves the old URL dead, so a 301 is written before the
  // new one is saved. Losing a ranking to a typo fix is avoidable.
  if (data.postId) {
    const { data: current } = await supabase
      .from('blog_post_translations').select('slug')
      .eq('post_id', data.postId).eq('locale', data.locale).maybeSingle();
    const oldSlug = (current as { slug?: string } | null)?.slug;

    if (oldSlug && oldSlug !== data.slug) {
      await supabase.from('redirects').upsert({
        from_path: `/travel-guide/${oldSlug}`,
        to_path: `/travel-guide/${data.slug}`,
        status_code: 301,
      }, { onConflict: 'from_path' });
    }
  }

  const { error: translationError } = await supabase.from('blog_post_translations').upsert({
    post_id: postId,
    locale: data.locale,
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt || null,
    body_mdx: data.bodyMdx,
    meta_title: data.metaTitle || null,
    meta_description: data.metaDescription || null,
    focus_keyword: data.focusKeyword || null,
    canonical_url: data.canonicalUrl || null,
    robots: data.robots,
    og_title: data.ogTitle || null,
    og_description: data.ogDescription || null,
  }, { onConflict: 'post_id,locale' });

  if (translationError) {
    if (translationError.code === '23505') {
      return fail('Another post already uses that URL. Change the slug.', { slug: ['Already taken'] });
    }
    return fail(cleanError(translationError.message));
  }

  await invalidateTags('sitemap', 'home');
  revalidateTag(`post:${data.slug}`, 'max');
  revalidatePath('/travel-guide');
  revalidatePath('/admin/posts');

  return {
    status: 'saved',
    postId,
    message: data.status === 'published' ? 'Published and live.'
      : data.status === 'scheduled' ? `Scheduled for ${new Date(data.scheduledFor!).toLocaleString()}.`
      : 'Draft saved.',
  };
}

export async function saveThemeAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await getActor();
  if (!isStaff(actor)) return fail('You do not have permission to change the theme.');

  const parsed = themeSchema.safeParse({
    primary: formData.get('primary'), accent: formData.get('accent'),
    urgent: formData.get('urgent'), ink: formData.get('ink'),
    surface: formData.get('surface'), radius: formData.get('radius'),
    customCss: formData.get('customCss') ?? '',
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the colours.',
      parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  const supabase = await getSupabaseServerClient();
  const { customCss, ...theme } = parsed.data;

  await supabase.from('site_settings').upsert([
    { key: 'theme', value: theme, updated_by: actor!.id },
    { key: 'custom_css', value: { css: customCss ?? '' }, updated_by: actor!.id },
  ], { onConflict: 'key' });

  // Theme tokens appear on every page, so every cached page is now stale.
  await invalidateTags('home', 'sitemap');
  revalidatePath('/', 'layout');
  return { status: 'saved', message: 'Theme saved. Changes appear across the site immediately.' };
}

export async function saveSettingAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await getActor();
  if (!isStaff(actor)) return fail('You do not have permission to change settings.');

  const key = String(formData.get('key') ?? '');
  const raw = String(formData.get('value') ?? '{}');
  if (!key) return fail('Missing setting.');

  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail('That is not valid JSON.'); }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from('site_settings')
    .upsert({ key, value, updated_by: actor!.id }, { onConflict: 'key' });

  if (error) return fail(cleanError(error.message));

  revalidatePath('/', 'layout');
  return { status: 'saved', message: 'Saved.' };
}

const cleanError = (message: string) => message.replace(/^.*ERROR:\s*/, '').trim();
