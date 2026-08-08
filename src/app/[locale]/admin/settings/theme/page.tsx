import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale } from '@/lib/i18n/config';
import { ThemeEditor } from '@/components/admin/theme-editor';

export const dynamic = 'force-dynamic';

export default async function ThemeSettings({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from('site_settings').select('key, value')
    .in('key', ['theme', 'custom_css']);

  const settings = Object.fromEntries(
    ((data ?? []) as unknown as Array<Record<string, any>>).map((r) => [String(r.key), r.value]),
  );
  const theme = (settings.theme ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Theme &amp; CSS</h1>
        <p className="max-w-2xl text-[var(--text-sm)] text-[var(--ink-soft)]">
          These five colours drive the whole site. Everything else — hovers, washes, borders —
          is derived from them, which is why the palette stays coherent when you change one.
        </p>
      </header>

      <ThemeEditor
        theme={{
          primary: theme.primary ?? '#0E6E64',
          accent: theme.accent ?? '#B98A2E',
          urgent: theme.urgent ?? '#C2334E',
          ink: theme.ink ?? '#0B1F1C',
          surface: theme.surface ?? '#EFF2F1',
          radius: theme.radius ?? '22px',
        }}
        customCss={(settings.custom_css as { css?: string })?.css ?? ''}
      />
    </div>
  );
}
