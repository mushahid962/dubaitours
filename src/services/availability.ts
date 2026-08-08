import 'server-only';
import { getSupabasePublicClient } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type AvailabilityOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  pax: Array<{ type: string; label: string; price: number; minQty: number; maxQty: number }>;
  departures: Array<{ id: string; startsAt: string; seatsLeft: number; priceFrom: number }>;
};

const PAX_LABELS: Record<string, Record<string, string>> = {
  en: { adult: 'Adult', child: 'Child', infant: 'Infant', senior: 'Senior', student: 'Student', group: 'Group', vehicle: 'Vehicle' },
  ar: { adult: 'بالغ', child: 'طفل', infant: 'رضيع', senior: 'كبار السن', student: 'طالب', group: 'مجموعة', vehicle: 'مركبة' },
  hi: { adult: 'वयस्क', child: 'बच्चा', infant: 'शिशु', senior: 'वरिष्ठ', student: 'छात्र', group: 'समूह', vehicle: 'वाहन' },
  ur: { adult: 'بالغ', child: 'بچہ', infant: 'شیرخوار', senior: 'بزرگ', student: 'طالب علم', group: 'گروپ', vehicle: 'گاڑی' },
};

/**
 * Availability for the next `days` days.
 *
 * Deliberately not Redis-cached at this layer. A stale price is an annoyance;
 * a stale seat count sells a place that doesn't exist and forces a manual
 * refund. The page around this is statically cached — this one query is the
 * part that stays live, and the server re-prices at checkout regardless.
 */
export async function getAvailability(
  tourId: string,
  locale: Locale,
  currency: string,
  days = 60,
): Promise<AvailabilityOption[]> {
  const supabase = getSupabasePublicClient();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + days);

  const { data: options } = await supabase
    .from('tour_options')
    .select(`
      id, code, position, max_pax, is_private,
      translations:tour_option_translations!inner ( name, description, locale ),
      prices:tour_prices ( pax, currency, list_price, min_qty, max_qty )
    `)
    .eq('tour_id', tourId)
    .eq('is_active', true)
    .eq('translations.locale', locale)
    .order('position');

  if (!options?.length) return [];

  const { data: departures } = await supabase
    .from('tour_departures')
    .select('id, option_id, starts_at, capacity, seats_booked, seats_held, price_override')
    .eq('tour_id', tourId)
    .eq('is_closed', false)
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', horizon.toISOString())
    .order('starts_at');

  const labels = PAX_LABELS[locale] ?? PAX_LABELS.en;

  return options.map((option) => {
    const translation = (option.translations as never as Array<{ name: string; description: string | null }>)[0];
    const prices = (option.prices as never as Array<{
      pax: string; currency: string; list_price: string; min_qty: number; max_qty: number | null;
    }>).filter((p) => p.currency === currency);

    const pax = prices
      .map((price) => ({
        type: price.pax,
        label: labels[price.pax] ?? price.pax,
        price: Number(price.list_price),
        minQty: price.min_qty,
        maxQty: price.max_qty ?? option.max_pax ?? 20,
      }))
      // Adults first — it's the row travellers adjust most, and putting a
      // zero-priced infant line at the top reads as a broken price.
      .sort((a, b) => (a.type === 'adult' ? -1 : b.type === 'adult' ? 1 : a.type.localeCompare(b.type)));

    const adultPrice = pax.find((p) => p.type === 'adult')?.price ?? 0;

    return {
      id: option.id,
      code: option.code,
      name: translation?.name ?? option.code,
      description: translation?.description ?? null,
      isPrivate: option.is_private,
      pax,
      departures: (departures ?? [])
        .filter((d) => d.option_id === option.id)
        .map((d) => ({
          id: d.id,
          startsAt: d.starts_at,
          seatsLeft: Math.max(0, d.capacity - d.seats_booked - d.seats_held),
          priceFrom: d.price_override === null ? adultPrice : Number(d.price_override),
        })),
    };
  });
}

/**
 * The cheapest price actually on sale in the window, used for the "from"
 * price and the Offer node. Falls back to the denormalised column when a tour
 * has no departures loaded yet, so the page never shows a price of zero.
 */
export function lowestAvailablePrice(options: AvailabilityOption[], fallback: number): number {
  const prices = options.flatMap((option) =>
    option.departures.filter((d) => d.seatsLeft > 0).map((d) => d.priceFrom),
  );
  return prices.length ? Math.min(...prices) : fallback;
}

/** ISO date of the next departure with seats — feeds Offer.validFrom. */
export function nextAvailableDate(options: AvailabilityOption[]): string | null {
  const next = options
    .flatMap((option) => option.departures.filter((d) => d.seatsLeft > 0))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return next?.startsAt ?? null;
}
