'use client';

import { useActionState, useMemo, useOptimistic, useState, useTransition } from 'react';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { createBookingAction, type BookingActionState } from '@/actions/create-booking';
import { getQuoteAction } from '@/actions/get-quote';
import { formatMoney, formatDate } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';

type Departure = { id: string; startsAt: string; seatsLeft: number; priceFrom: number };
type Option = {
  id: string; code: string; name: string; description: string | null;
  pax: Array<{ type: string; label: string; price: number; minQty: number; maxQty: number }>;
  departures: Departure[];
};

type Props = {
  tourId: string;
  locale: Locale;
  currency: string;
  options: Option[];
  cancellationHours: number | null;
  timezone: string;
};

/**
 * The booking panel. It quotes optimistically so the total moves the instant
 * a traveller taps +, then reconciles against a server quote — the server's
 * number is always the one that wins, because it's the one that gets charged.
 */
export function BookingWidget({ tourId, locale, currency, options, cancellationHours, timezone }: Props) {
  const [optionId, setOptionId] = useState(options[0]?.id ?? '');
  const [departureId, setDepartureId] = useState('');
  const [pax, setPax] = useState<Record<string, number>>({ adult: 2 });
  const [isQuoting, startQuote] = useTransition();
  const [serverQuote, setServerQuote] = useState<{ total: number; discount: number } | null>(null);
  const [state, submit, isSubmitting] = useActionState<BookingActionState, FormData>(
    createBookingAction,
    { status: 'idle' },
  );

  const option = options.find((o) => o.id === optionId) ?? options[0];
  const departure = option?.departures.find((d) => d.id === departureId) ?? null;

  const localTotal = useMemo(
    () => option?.pax.reduce((sum, p) => sum + p.price * (pax[p.type] ?? 0), 0) ?? 0,
    [option, pax],
  );

  const seats = Object.entries(pax)
    .filter(([type]) => type !== 'infant')
    .reduce((sum, [, qty]) => sum + qty, 0);

  const total = serverQuote?.total ?? localTotal;
  const overCapacity = departure ? seats > departure.seatsLeft : false;

  function adjust(type: string, delta: number, min: number, max: number) {
    setPax((current) => {
      const next = Math.min(max, Math.max(min, (current[type] ?? 0) + delta));
      const updated = { ...current, [type]: next };
      requestQuote(updated);
      return updated;
    });
  }

  function requestQuote(nextPax: Record<string, number>) {
    if (!departureId) return;
    startQuote(async () => {
      const quote = await getQuoteAction({
        items: [{ tourId, optionId, departureId, pax: nextPax }],
        currency,
      });
      setServerQuote(quote.ok ? { total: quote.grandTotal, discount: quote.discountTotal } : null);
    });
  }

  return (
    <form action={submit} className="glass-panel sticky top-24 flex flex-col gap-5 p-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="idempotencyKey" value={useMemo(() => crypto.randomUUID(), [])} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify([{ tourId, optionId, departureId, pax }])}
      />

      <header className="flex items-baseline justify-between">
        <p className="flex flex-col">
          <span className="text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
            Total for {seats} {seats === 1 ? 'traveller' : 'travellers'}
          </span>
          <span className="text-[var(--text-3xl)] font-bold tabular-nums text-[var(--ink)]">
            {formatMoney(total, currency, locale)}
          </span>
        </p>
        {isQuoting && <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-faint)]" aria-label="Updating price" />}
      </header>

      {options.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[var(--text-sm)] font-semibold">Choose your option</legend>
          {options.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-colors"
              style={{ borderColor: item.id === optionId ? 'var(--teal)' : 'var(--hairline)' }}
            >
              <input
                type="radio"
                name="optionId"
                value={item.id}
                checked={item.id === optionId}
                onChange={() => { setOptionId(item.id); setDepartureId(''); setServerQuote(null); }}
                className="mt-1 accent-[var(--teal)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[var(--text-sm)] font-semibold">{item.name}</span>
                {item.description && (
                  <span className="text-[var(--text-xs)] text-[var(--ink-soft)]">{item.description}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[var(--text-sm)] font-semibold">Pick a date</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {option?.departures.slice(0, 14).map((d) => {
            const selected = d.id === departureId;
            const soldOut = d.seatsLeft <= 0;
            return (
              <button
                key={d.id}
                type="button"
                disabled={soldOut}
                onClick={() => { setDepartureId(d.id); requestQuote(pax); }}
                aria-pressed={selected}
                className="flex min-w-[84px] flex-col items-center gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-[var(--text-sm)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: selected ? 'var(--teal)' : 'var(--hairline)',
                  background: selected ? 'var(--teal-wash)' : 'transparent',
                }}
              >
                <span className="font-semibold">{formatDate(d.startsAt, locale, timezone)}</span>
                <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                  {soldOut ? 'Sold out' : formatMoney(d.priceFrom, currency, locale)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[var(--text-sm)] font-semibold">Travellers</legend>
        {option?.pax.map((p) => (
          <div key={p.type} className="flex items-center justify-between">
            <span className="flex flex-col">
              <span className="text-[var(--text-sm)]">{p.label}</span>
              <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
                {formatMoney(p.price, currency, locale)} each
              </span>
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => adjust(p.type, -1, p.minQty, p.maxQty)}
                disabled={(pax[p.type] ?? 0) <= p.minQty}
                aria-label={`Remove one ${p.label}`}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hairline)] disabled:opacity-30"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-6 text-center tabular-nums" aria-live="polite">{pax[p.type] ?? 0}</span>
              <button
                type="button"
                onClick={() => adjust(p.type, 1, p.minQty, p.maxQty)}
                disabled={(pax[p.type] ?? 0) >= p.maxQty}
                aria-label={`Add one ${p.label}`}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hairline)] disabled:opacity-30"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </div>
        ))}
      </fieldset>

      {overCapacity && departure && (
        <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">
          Only {departure.seatsLeft} places remain on that date. Reduce the party size or pick another date.
        </p>
      )}

      {state.status === 'error' && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--pomegranate)_12%,transparent)] p-3 text-[var(--text-sm)] text-[var(--pomegranate)]">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={!departureId || seats === 0 || overCapacity || isSubmitting}
        className="flex items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 py-3.5 text-[var(--text-base)] font-semibold text-white transition-colors hover:bg-[var(--teal-deep)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {departureId ? 'Continue to payment' : 'Pick a date to continue'}
      </button>

      <p className="text-center text-[var(--text-xs)] text-[var(--ink-soft)]">
        {cancellationHours
          ? `Free cancellation up to ${cancellationHours} hours before departure.`
          : 'This experience is non-refundable once booked.'}
        {' '}Places are held for 15 minutes at checkout.
      </p>
    </form>
  );
}
