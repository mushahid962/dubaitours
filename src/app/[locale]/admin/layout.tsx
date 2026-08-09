import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { AdminNav, adminNav } from '@/components/admin/admin-nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;

  if (!isDatabaseConfigured()) notFound();
  const actor = await requireAdmin(locale, `${prefix}/admin`);

  const current = (await headers()).get('x-thg-pathname') ?? `${prefix}/admin`;
  const supabase = await getSupabaseServerClient();

  // Counts drive the sidebar badges. head:true fetches no rows — an admin
  // panel that pulls every lead just to show a number gets slow fast.
  const [leads, posts, tours, applications, claims, reviews, draftLocations] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
    supabase.from('tours').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
    supabase.from('company_applications').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_review']),
    supabase.from('listing_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
  ]);

  const groups = adminNav(prefix, {
    leads: leads.count ?? 0, posts: posts.count ?? 0, tours: tours.count ?? 0,
    applications: applications.count ?? 0, claims: claims.count ?? 0, reviews: reviews.count ?? 0,
    locations: draftLocations.count ?? 0,
  });

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      <aside className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-4">
          <p className="flex items-center gap-2 px-3">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[var(--ink)] text-[var(--text-sm)] font-bold text-[var(--salt)]">
              A
            </span>
            <span className="flex flex-col">
              <span className="text-[var(--text-sm)] font-semibold">Admin</span>
              <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                {actor.displayName ?? actor.email}
              </span>
            </span>
          </p>
          <AdminNav groups={groups} current={current} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
