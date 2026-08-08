import { notFound } from 'next/navigation';
import { getCompanyBySlug } from '@/services/dashboard-repository';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { formatMoney, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPayouts({
  params,
}: { params: Promise<{ locale: string; company: string }> }) {
  const { locale: raw, company: slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('payout_ledger').select('*')
    .eq('company_id', company.id)
    .order('booked_at', { ascending: false }).limit(200);

  const rows = ((data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
    reference: String(row.reference), bookedAt: String(row.booked_at),
    travelAt: row.travel_at ? String(row.travel_at) : null,
    gross: Number(row.grand_total), commission: Number(row.commission_total),
    net: Number(row.supplier_net), currency: String(row.currency),
    status: String(row.status), paidOut: Boolean(row.paid_out),
    paidAt: row.paid_at ? String(row.paid_at) : null,
  }));

  const currency = rows[0]?.currency ?? company.payout_currency ?? 'AED';
  const cancelled = (s: string) => s.startsWith('cancelled');

  // Cancelled bookings are excluded from what is owed but still listed, so a
  // supplier can see why a number moved rather than assuming a mistake.
  const earned = rows.filter((r) => !cancelled(r.status));
  const pending = earned.filter((r) => !r.paidOut);
  const paid = earned.filter((r) => r.paidOut);

  const total = (list: typeof rows, key: 'gross' | 'commission' | 'net') =>
    list.reduce((sum, row) => sum + row[key], 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="Awaiting payout" value={formatMoney(total(pending, 'net'), currency, locale)}
          note={`${pending.length} booking${pending.length === 1 ? '' : 's'}`} strong />
        <Card label="Paid out to date" value={formatMoney(total(paid, 'net'), currency, locale)}
          note={`${paid.length} booking${paid.length === 1 ? '' : 's'}`} />
        <Card label="Platform commission" value={formatMoney(total(earned, 'commission'), currency, locale)}
          note={`${company.commission_rate}% of ${formatMoney(total(earned, 'gross'), currency, locale)} gross`} />
      </section>

      <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
        Payouts run every Monday for experiences that have already taken place. A booking moves
        from "awaiting" to "paid" once the transfer leaves.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--paper)] p-6 text-[var(--text-sm)] text-[var(--ink-soft)]">
          Nothing yet. Every confirmed booking appears here with its commission broken out.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--paper)]">
          <table className="w-full text-[var(--text-sm)]">
            <caption className="sr-only">Booking-level earnings</caption>
            <thead className="border-b border-[var(--hairline)] text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              <tr>
                {['Reference', 'Travel date', 'Gross', 'Commission', 'You earn', 'Status'].map((h, i) => (
                  <th key={h} scope="col" className={`p-3 ${i > 1 ? 'text-end' : 'text-start'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {rows.map((row) => (
                <tr key={row.reference} className={cancelled(row.status) ? 'text-[var(--ink-faint)]' : ''}>
                  <td className="p-3 font-[family-name:var(--font-mono)] text-[var(--text-xs)]">{row.reference}</td>
                  <td className="p-3">{row.travelAt ? formatDate(row.travelAt, locale) : '—'}</td>
                  <td className="p-3 text-end tabular-nums">{formatMoney(row.gross, row.currency, locale)}</td>
                  <td className="p-3 text-end tabular-nums">−{formatMoney(row.commission, row.currency, locale)}</td>
                  <td className="p-3 text-end font-semibold tabular-nums">
                    {cancelled(row.status) ? '—' : formatMoney(row.net, row.currency, locale)}
                  </td>
                  <td className="p-3 text-end text-[var(--text-xs)]">
                    {cancelled(row.status) ? 'Cancelled' : row.paidOut ? `Paid ${row.paidAt ? formatDate(row.paidAt, locale) : ''}` : 'Awaiting'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, note, strong }: {
  label: string; value: string; note: string; strong?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-[var(--radius-lg)] p-5 ${strong ? 'bg-[var(--teal-wash)]' : 'bg-[var(--paper)]'}`}>
      <span className="text-[var(--text-xs)] uppercase tracking-[0.06em] text-[var(--ink-faint)]">{label}</span>
      <span className={`text-[var(--text-2xl)] font-bold tabular-nums ${strong ? 'text-[var(--teal-deep)]' : ''}`}>{value}</span>
      <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">{note}</span>
    </div>
  );
}
