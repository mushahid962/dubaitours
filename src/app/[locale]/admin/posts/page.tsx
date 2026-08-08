import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, CalendarClock, CheckCircle2, FileEdit, Archive } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS = {
  published: { label: 'Published', icon: CheckCircle2, colour: 'var(--teal)' },
  scheduled: { label: 'Scheduled', icon: CalendarClock, colour: 'var(--brass)' },
  draft: { label: 'Draft', icon: FileEdit, colour: 'var(--ink-faint)' },
  archived: { label: 'Archived', icon: Archive, colour: 'var(--ink-faint)' },
} as const;

export default async function AdminPosts({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('blog_posts')
    .select(`
      id, status, post_type, published_at, scheduled_for, updated_at, is_featured, reading_minutes,
      author:authors ( name ),
      translations:blog_post_translations ( locale, title, slug, meta_description )
    `)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(100);

  const posts = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => {
    const t = (row.translations ?? []).find((x: any) => x.locale === locale) ?? (row.translations ?? [])[0];
    return {
      id: String(row.id), status: String(row.status), type: String(row.post_type),
      title: t?.title ?? 'Untitled', slug: t?.slug ?? '',
      hasMeta: Boolean(t?.meta_description),
      author: row.author?.name ?? 'No author',
      readingMinutes: Number(row.reading_minutes ?? 0),
      scheduledFor: row.scheduled_for ?? null,
      updatedAt: String(row.updated_at),
      isFeatured: Boolean(row.is_featured),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Posts</h1>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            {posts.length} post{posts.length === 1 ? '' : 's'} in {locale.toUpperCase()}
          </p>
        </div>
        <Link href={`${prefix}/admin/posts/new`}
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
          <Plus className="h-4 w-4" aria-hidden /> New post
        </Link>
      </header>

      {posts.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-8">
          <h2 className="text-[var(--text-xl)] font-semibold">No posts yet</h2>
          <p className="max-w-md text-[var(--text-sm)] text-[var(--ink-soft)]">
            Destination guides are how a marketplace ranks for the searches that happen before
            anyone is ready to book. Start with one city.
          </p>
          <Link href={`${prefix}/admin/posts/new`}
            className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
            Write the first one
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => {
            const status = STATUS[post.status as keyof typeof STATUS] ?? STATUS.draft;
            const Icon = status.icon;
            return (
              <li key={post.id} className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`${prefix}/admin/posts/${post.id}`} className="truncate font-semibold hover:text-[var(--teal)]">
                    {post.title}
                  </Link>
                  <span className="flex flex-wrap items-center gap-x-3 text-[var(--text-xs)] text-[var(--ink-faint)]">
                    <span className="inline-flex items-center gap-1" style={{ color: status.colour }}>
                      <Icon className="h-3.5 w-3.5" aria-hidden /> {status.label}
                    </span>
                    <span className="capitalize">{post.type}</span>
                    <span>{post.author}</span>
                    <span>{post.readingMinutes} min</span>
                    {post.scheduledFor && <span>goes live {formatDate(post.scheduledFor, locale)}</span>}
                    {/* A missing meta description is the most common and most
                        costly omission, so it is flagged in the list itself. */}
                    {!post.hasMeta && <span className="text-[var(--brass)]">no meta description</span>}
                  </span>
                </div>
                <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {formatDate(post.updatedAt, locale)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
