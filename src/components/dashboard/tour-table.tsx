import Link from 'next/link';
import { AlertCircle, Clock3, CheckCircle2, PauseCircle, FileEdit } from 'lucide-react';
import type { DashboardTour } from '@/services/dashboard-repository';
import type { Locale } from '@/lib/i18n/config';
import { formatMoney } from '@/lib/format';

const STATUS = {
  published: { label: 'Live', icon: CheckCircle2, colour: 'var(--teal)' },
  in_review: { label: 'In review', icon: Clock3, colour: 'var(--brass)' },
  draft:     { label: 'Draft', icon: FileEdit, colour: 'var(--ink-faint)' },
  rejected:  { label: 'Needs changes', icon: AlertCircle, colour: 'var(--pomegranate)' },
  paused:    { label: 'Paused', icon: PauseCircle, colour: 'var(--ink-faint)' },
  archived:  { label: 'Archived', icon: PauseCircle, colour: 'var(--ink-faint)' },
} as const;

export function TourTable({
  tours, basePath, locale,
}: { tours: DashboardTour[]; basePath: string; locale: Locale }) {
  if (!tours.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-8">
        <h2 className="text-[var(--text-xl)] font-semibold">No listings yet</h2>
        <p className="max-w-md text-[var(--text-sm)] text-[var(--ink-soft)]">
          Add your first experience. You can save it as a draft and come back — nothing goes live
          until you submit it and our team approves it.
        </p>
        <Link href={`${basePath}/tours/new`}
          className="rounded-[var(--radius-pill)] bg-[var(--teal)] px-5 py-2.5 text-[var(--text-sm)] font-semibold text-white">
          Create your first listing
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tours.map((tour) => {
        const status = STATUS[tour.status as keyof typeof STATUS] ?? STATUS.draft;
        const Icon = status.icon;
        const needsWork = tour.completeness < 80;

        return (
          <li key={tour.id} className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`${basePath}/tours/${tour.id}`} className="truncate font-semibold hover:text-[var(--teal)]">
                {tour.title}
              </Link>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-xs)] text-[var(--ink-faint)]">
                <span className="inline-flex items-center gap-1" style={{ color: status.colour }}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {status.label}
                </span>
                <span>{tour.futureDepartures} future dates</span>
                <span>{tour.seatsAvailable} seats to fill</span>
                <span>{tour.mediaCount} photos</span>
                {tour.ratingCount > 0 && <span>{tour.ratingAvg.toFixed(1)} ★ ({tour.ratingCount})</span>}
              </span>
              {tour.rejectedReason && (
                <span className="text-[var(--text-xs)] text-[var(--pomegranate)]">
                  Reviewer: {tour.rejectedReason}
                </span>
              )}
            </div>

            {/* Completeness is shown as a bar rather than a number alone — a
                supplier acts on "you're nearly there", not on "72". */}
            <div className="flex w-32 flex-col gap-1">
              <span className="flex justify-between text-[var(--text-xs)] text-[var(--ink-faint)]">
                Complete <span className={needsWork ? 'text-[var(--brass)]' : 'text-[var(--teal)]'}>{tour.completeness}%</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--limestone)]">
                <span className="block h-full rounded-full"
                  style={{ width: `${tour.completeness}%`, background: needsWork ? 'var(--brass)' : 'var(--teal)' }} />
              </span>
            </div>

            <span className="w-24 text-end font-semibold tabular-nums">
              {tour.fromPrice > 0 ? formatMoney(tour.fromPrice, tour.currency, locale) : '—'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
