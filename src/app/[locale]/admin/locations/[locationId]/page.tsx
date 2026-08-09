import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/session';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { LocationEditor, type LocationDraft } from '@/components/admin/location-editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const EMPTY: LocationDraft = {
  level: 'city', parentId: '', countryCode: 'AE', locationCode: '', timezone: 'Asia/Dubai',
  latitude: '', longitude: '', radiusM: '',
  name: '', slug: '', h1: '', tagline: '', intro: '', description: '', body: '',
  metaTitle: '', metaDescription: '', canonicalUrl: '', robots: 'index,follow',
  ogTitle: '', ogDescription: '',
  heroImageUrl: '', status: 'draft', displayOrder: 0, isFeatured: false, isIndexable: true,
  listingCount: 0, childCount: 0,
};

export default async function LocationEditorPage({
  params,
}: { params: Promise<{ locale: string; locationId: string }> }) {
  const { locale: raw, locationId } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const isNew = locationId === 'new';

  await requirePermission(locale, 'settings.write', '/admin/locations');

  const supabase = await getSupabaseServerClient();

  // Anything that can be a parent. POIs are excluded — nothing nests under one.
  const { data: parentRows } = await supabase
    .from('locations')
    .select('id, level, depth, country_code, translations:location_translations ( locale, name )')
    .neq('level', 'poi').order('path').limit(400);

  const parents = ((parentRows ?? []) as unknown as Array<Record<string, any>>).map((row) => {
    const t = (row.translations ?? []).find((x: any) => x.locale === locale) ?? (row.translations ?? [])[0];
    return {
      id: String(row.id),
      label: `${'— '.repeat(Number(row.depth ?? 0))}${t?.name ?? '(untranslated)'} · ${row.level}`,
    };
  });

  let draft = EMPTY;

  if (!isNew) {
    const { data } = await supabase
      .from('locations')
      .select('*, translations:location_translations ( * )')
      .eq('id', locationId).maybeSingle();
    if (!data) notFound();

    const row = data as unknown as Record<string, any>;
    const t = (row.translations ?? []).find((x: any) => x.locale === locale) ?? {};

    draft = {
      id: String(row.id),
      level: String(row.level),
      parentId: row.parent_id ?? '',
      countryCode: String(row.country_code ?? 'AE'),
      locationCode: row.location_code ?? '',
      timezone: String(row.timezone ?? 'Asia/Dubai'),
      latitude: row.latitude === null ? '' : String(row.latitude),
      longitude: row.longitude === null ? '' : String(row.longitude),
      radiusM: row.radius_m === null ? '' : String(row.radius_m),
      name: t.name ?? '', slug: t.slug ?? '', h1: t.h1 ?? '', tagline: t.tagline ?? '',
      intro: t.intro ?? '', description: t.description ?? '', body: t.body ?? '',
      metaTitle: t.meta_title ?? '', metaDescription: t.meta_description ?? '',
      canonicalUrl: t.canonical_url ?? '', robots: t.robots ?? 'index,follow',
      ogTitle: t.og_title ?? '', ogDescription: t.og_description ?? '',
      heroImageUrl: row.hero_image_url ?? '',
      status: String(row.status ?? 'draft'),
      displayOrder: Number(row.display_order ?? 0),
      isFeatured: Boolean(row.is_featured),
      isIndexable: Boolean(row.is_indexable),
      listingCount: Number(row.listing_count ?? 0),
      childCount: Number(row.child_count ?? 0),
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href={`${prefix}/admin/locations`} className="text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)]">
          ← All locations
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)]">
          {isNew ? 'New location' : draft.name || 'Untitled location'}
        </h1>
      </header>

      <LocationEditor locale={locale} draft={draft} parents={parents} />
    </div>
  );
}
