import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale } from '@/lib/i18n/config';
import { SettingEditor } from '@/components/admin/setting-editor';

export const dynamic = 'force-dynamic';

export default async function SeoSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await getSupabaseServerClient();
  const [{ data: settings }, { data: redirects }] = await Promise.all([
    supabase.from('site_settings').select('key, value').in('key', ['robots_txt', 'sitemap', 'seo']),
    supabase.from('redirects').select('from_path, to_path, status_code, hits').order('from_path').limit(50),
  ]);

  const byKey = Object.fromEntries(
    ((settings ?? []) as unknown as Array<Record<string, any>>).map((r) => [String(r.key), r.value]),
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Sitemap &amp; robots</h1>
        <p className="max-w-2xl text-[var(--text-sm)] text-[var(--ink-soft)]">
          Sitemaps are generated from live content at{' '}
          <Link href="/sitemaps/tours.xml" className="text-[var(--teal)] hover:underline">/sitemaps/tours.xml</Link>,{' '}
          <Link href="/sitemaps/destinations.xml" className="text-[var(--teal)] hover:underline">destinations</Link>,{' '}
          blog and images. These settings layer on top.
        </p>
      </header>

      <SettingEditor
        settingKey="robots_txt" title="robots.txt additions"
        description='Extra rules appended to the generated file. Setting "noindex_site": true blocks the entire site — use it for a staging domain, never production.'
        value={byKey.robots_txt ?? { extra_rules: '', noindex_site: false }} />

      <SettingEditor
        settingKey="sitemap" title="Sitemap overrides"
        description='Paths to exclude, e.g. {"exclude_paths": ["/tour/old-listing"]}.'
        value={byKey.sitemap ?? { exclude_paths: [], changefreq_override: null }} />

      <section aria-labelledby="redirects" className="flex flex-col gap-3">
        <h2 id="redirects" className="font-[family-name:var(--font-display)] text-[var(--text-xl)]">
          Redirects
        </h2>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Created automatically whenever a slug changes, so rankings and inbound links survive.
        </p>
        {(redirects ?? []).length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-5 text-[var(--text-sm)] text-[var(--ink-soft)]">
            None yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[var(--radius-lg)] bg-[var(--paper)] px-4">
            {((redirects ?? []) as unknown as Array<Record<string, any>>).map((r) => (
              <li key={String(r.from_path)} className="flex flex-wrap items-center gap-2 py-2.5 font-[family-name:var(--font-mono)] text-[var(--text-xs)]">
                <span className="text-[var(--ink-soft)]">{String(r.from_path)}</span>
                <span aria-hidden className="text-[var(--ink-faint)]">→</span>
                <span>{String(r.to_path)}</span>
                <span className="ms-auto text-[var(--ink-faint)]">{String(r.status_code)} · {String(r.hits)} hits</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
