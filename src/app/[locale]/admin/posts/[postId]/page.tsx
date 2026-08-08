import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { PostEditor, type PostDraft } from '@/components/admin/post-editor';

export const dynamic = 'force-dynamic';

const EMPTY: PostDraft = {
  title: '', slug: '', excerpt: '', bodyMdx: '', postType: 'guide',
  authorId: '', reviewerId: null, cityId: null, countryId: null, coverMediaId: null,
  tags: '', metaTitle: '', metaDescription: '', focusKeyword: '', canonicalUrl: '',
  robots: 'index,follow', ogTitle: '', ogDescription: '',
  customSchema: '', customCss: '', customHead: '',
  status: 'draft', scheduledFor: '', isFeatured: false,
};

export default async function PostEditorPage({
  params,
}: { params: Promise<{ locale: string; postId: string }> }) {
  const { locale: raw, postId } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const isNew = postId === 'new';

  const supabase = await getSupabaseServerClient();
  const [authorsRes, citiesRes, countriesRes] = await Promise.all([
    supabase.from('authors').select('id, name').eq('is_active', true).order('name'),
    supabase.from('city_translations').select('city_id, name').eq('locale', locale).order('name'),
    supabase.from('country_translations').select('country_id, name').eq('locale', locale).order('name'),
  ]);

  const authors = ((authorsRes.data ?? []) as unknown as Array<Record<string, any>>)
    .map((r) => ({ id: String(r.id), name: String(r.name) }));
  const cities = ((citiesRes.data ?? []) as unknown as Array<Record<string, any>>)
    .map((r) => ({ id: String(r.city_id), name: String(r.name) }));
  const countries = ((countriesRes.data ?? []) as unknown as Array<Record<string, any>>)
    .map((r) => ({ id: String(r.country_id), name: String(r.name) }));

  let draft = EMPTY;

  if (!isNew) {
    const { data } = await supabase
      .from('blog_posts')
      .select('*, translations:blog_post_translations ( * )')
      .eq('id', postId).maybeSingle();
    if (!data) notFound();

    const post = data as unknown as Record<string, any>;
    const t = (post.translations ?? []).find((x: any) => x.locale === locale) ?? {};

    draft = {
      id: String(post.id),
      title: t.title ?? '', slug: t.slug ?? '', excerpt: t.excerpt ?? '',
      bodyMdx: t.body_mdx ?? '', postType: String(post.post_type ?? 'guide'),
      authorId: String(post.author_id ?? ''), reviewerId: post.reviewer_id ?? null,
      cityId: post.city_id ?? null, countryId: post.country_id ?? null,
      coverMediaId: post.cover_media_id ?? null,
      tags: '',
      metaTitle: t.meta_title ?? '', metaDescription: t.meta_description ?? '',
      focusKeyword: t.focus_keyword ?? '', canonicalUrl: t.canonical_url ?? '',
      robots: t.robots ?? 'index,follow',
      ogTitle: t.og_title ?? '', ogDescription: t.og_description ?? '',
      customSchema: post.custom_schema ? JSON.stringify(post.custom_schema, null, 2) : '',
      customCss: post.custom_css ?? '', customHead: post.custom_head ?? '',
      status: String(post.status ?? 'draft'),
      scheduledFor: post.scheduled_for ? String(post.scheduled_for).slice(0, 16) : '',
      isFeatured: Boolean(post.is_featured),
    };
  }

  if (authors.length === 0) {
    // Author is required, so an empty authors table is a dead end rather than
    // a validation error the writer cannot resolve.
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--brass-wash)] p-6">
        <h1 className="text-[var(--text-xl)] font-semibold">Add an author first</h1>
        <p className="max-w-lg text-[var(--text-sm)] text-[var(--ink-soft)]">
          Every post needs a byline — it is one of the strongest E-E-A-T signals a travel site has,
          and Google treats anonymous travel content as low quality. Insert a row into{' '}
          <code className="font-[family-name:var(--font-mono)]">authors</code> in Supabase, with a
          real name, bio and credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href={`${prefix}/admin/posts`} className="text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)]">
          ← All posts
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
          {isNew ? 'New post' : draft.title || 'Untitled post'}
        </h1>
      </header>

      <PostEditor
        locale={locale}
        draft={isNew ? { ...EMPTY, authorId: authors[0].id } : draft}
        authors={authors} cities={cities} countries={countries}
      />
    </div>
  );
}
