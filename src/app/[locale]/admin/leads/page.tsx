import { notFound } from 'next/navigation';
import { Mail, Phone, Building2 } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatDate, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PIPELINE = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;

export default async function AdminLeads({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const { status } = await searchParams;
  const filter = PIPELINE.includes(status as never) ? status! : null;

  const supabase = await getSupabaseServerClient();
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
  if (filter) query = query.eq('status', filter);
  const { data } = await query;

  const leads = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    id: String(row.id), status: String(row.status), source: String(row.source),
    name: String(row.name), email: row.email ?? null, phone: row.phone ?? null,
    companyName: row.company_name ?? null, message: row.message ?? null,
    partySize: row.party_size ?? null, travelDate: row.travel_date ?? null,
    value: row.estimated_value ? Number(row.estimated_value) : null,
    currency: row.currency ?? 'AED', createdAt: String(row.created_at),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)]">Leads</h1>
        <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
          Enquiries that are not bookings — group quotes, corporate requests, partner interest.
        </p>
      </header>

      <nav aria-label="Pipeline stage" className="flex flex-wrap gap-2">
        <a href="?" className={`rounded-[var(--radius-pill)] border px-4 py-1.5 text-[var(--text-sm)] ${
          !filter ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]' : 'border-[var(--hairline)]'
        }`}>All</a>
        {PIPELINE.map((stage) => (
          <a key={stage} href={`?status=${stage}`}
            className={`rounded-[var(--radius-pill)] border px-4 py-1.5 text-[var(--text-sm)] capitalize ${
              filter === stage ? 'border-[var(--teal)] bg-[var(--teal-wash)] font-medium text-[var(--teal-deep)]' : 'border-[var(--hairline)]'
            }`}>{stage}</a>
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          No leads {filter ? `at the ${filter} stage` : 'yet'}. The contact and group-quote forms
          write here — those forms are not built yet, so this fills up once they are.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li key={lead.id} className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  {lead.name}
                  {lead.companyName && (
                    <span className="inline-flex items-center gap-1 text-[var(--text-sm)] font-normal text-[var(--ink-soft)]">
                      <Building2 className="h-3.5 w-3.5" aria-hidden /> {lead.companyName}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-[var(--text-xs)]">
                  <span className="rounded-full bg-[var(--limestone)] px-2 py-0.5 capitalize">{lead.status}</span>
                  <span className="text-[var(--ink-faint)]">{formatDate(lead.createdAt, locale)}</span>
                </span>
              </div>

              {lead.message && (
                <p className="text-[var(--text-sm)] leading-relaxed text-[var(--ink-soft)]">{lead.message}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-[var(--text-sm)]">
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 text-[var(--teal)] hover:underline">
                    <Mail className="h-3.5 w-3.5" aria-hidden /> {lead.email}
                  </a>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-[var(--teal)] hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden /> {lead.phone}
                  </a>
                )}
                {lead.partySize && <span className="text-[var(--ink-soft)]">{lead.partySize} travellers</span>}
                {lead.travelDate && <span className="text-[var(--ink-soft)]">travelling {formatDate(lead.travelDate, locale)}</span>}
                {lead.value && (
                  <span className="font-semibold">{formatMoney(lead.value, lead.currency, locale)}</span>
                )}
                <span className="text-[var(--text-xs)] capitalize text-[var(--ink-faint)]">
                  via {lead.source.replace(/_/g, ' ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
