import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config';
import { MenuEditor } from '@/components/admin/menu-editor';

export const dynamic = 'force-dynamic';

export default async function AdminMenus({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  const supabase = await getSupabaseServerClient();
  const [menusRes, itemsRes] = await Promise.all([
    supabase.from('navigation_menus').select('id, key, is_active').order('key'),
    supabase.from('navigation_items').select('*').order('position'),
  ]);

  const menus = ((menusRes.data ?? []) as unknown as Array<Record<string, any>>).map((m) => ({
    id: String(m.id), key: String(m.key),
    items: ((itemsRes.data ?? []) as unknown as Array<Record<string, any>>)
      .filter((i) => String(i.menu_id) === String(m.id))
      .map((i) => ({
        id: String(i.id), href: String(i.href), position: Number(i.position),
        labels: (i.labels ?? {}) as Record<string, string>,
        badge: i.badge ?? '', rel: i.rel ?? '', isVisible: Boolean(i.is_visible),
      })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Menus</h1>
        <p className="max-w-2xl text-[var(--text-sm)] text-[var(--ink-soft)]">
          Header and footer navigation. Each item carries a label per language — an untranslated
          label falls back to English rather than disappearing.
        </p>
      </header>

      {menus.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          No menus defined. The seed creates <code>header_main</code>, <code>footer_explore</code>{' '}
          and <code>footer_company</code> — run <code>seed.sql</code> if you have not.
        </p>
      ) : (
        menus.map((menu) => (
          <MenuEditor key={menu.id} menu={menu} locales={[...LOCALES]} />
        ))
      )}
    </div>
  );
}
