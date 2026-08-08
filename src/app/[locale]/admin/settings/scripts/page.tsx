import { notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

export default async function ScriptSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from('tracking_scripts')
    .select('id, name, placement, consent_category, is_active, countries')
    .order('name');

  const scripts = ((data ?? []) as unknown as Array<Record<string, any>>);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Header scripts</h1>
        <p className="max-w-2xl text-[var(--text-sm)] text-[var(--ink-soft)]">
          Analytics and pixels. Every script is tagged with a consent category and only loads once
          the visitor has allowed that category — which is what keeps GA4 and Meta Pixel lawful
          under GDPR and the GCC's own data laws.
        </p>
      </header>

      {scripts.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
          <h2 className="text-[var(--text-lg)] font-semibold">No scripts yet</h2>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            Add rows to <code className="font-[family-name:var(--font-mono)]">tracking_scripts</code>{' '}
            in Supabase. Each needs a name, the script body, a placement
            (head / body_start / body_end) and a consent category.
          </p>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            The insert form and the consent banner are not built yet — flagged in the roadmap.
            Until the banner exists, marketing scripts should stay inactive.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {scripts.map((script) => (
            <li key={String(script.id)} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
              <span className="flex-1 font-medium">{String(script.name)}</span>
              <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{String(script.placement)}</span>
              <span className="rounded-full bg-[var(--limestone)] px-2 py-0.5 text-[var(--text-xs)] capitalize">
                {String(script.consent_category)}
              </span>
              <span className={`text-[var(--text-xs)] font-semibold ${script.is_active ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'}`}>
                {script.is_active ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
