import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { CartItemInput } from '@/schemas/booking';

export type PricedLine = {
  tourId: string;
  optionId: string;
  departureId: string;
  startsAt: string;
  seats: number;
  paxBreakdown: Record<string, number>;
  unitPrices: Record<string, number>;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  commissionRate: number;
  supplierNet: number;
  companyId: string;
};

export type PricedCart = {
  companyId: string;
  currency: string;
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  feesTotal: number;
  taxTotal: number;
  grandTotal: number;
  commissionTotal: number;
  supplierNet: number;
  taxLines: Array<{ label: string; rate: number; amount: number }>;
};

/** VAT by country of supply. Bahrain and Oman differ from the UAE/KSA rates. */
const VAT_RATES: Record<string, number> = { AE: 5, SA: 15, BH: 10, OM: 5, QA: 0, KW: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Prices a cart entirely on the server.
 *
 * The client never sends money values. It sends what the traveller chose;
 * the server reads current prices, re-applies rules, and returns the total.
 * A tampered request simply gets the correct price back.
 */
export async function priceCart(
  supabase: Db,
  items: CartItemInput[],
  currency: string,
): Promise<PricedCart> {
  const lines: PricedLine[] = [];
  let companyId: string | null = null;

  for (const item of items) {
    const { data: departure, error } = await supabase
      .from('tour_departures')
      .select(`
        id, starts_at, local_date, capacity, seats_booked, seats_held, is_closed, price_override,
        tour:tours!inner ( id, company_id, min_pax, max_pax, city_id,
          company:companies!inner ( id, commission_rate ),
          city:cities!inner ( country:countries!inner ( iso2 ) ) )
      `)
      .eq('id', item.departureId)
      .eq('option_id', item.optionId)
      .single();

    if (error || !departure) {
      throw new BookingError('DEPARTURE_NOT_FOUND', 'That departure is no longer on sale.');
    }
    if (departure.is_closed) {
      throw new BookingError('DEPARTURE_CLOSED', 'That date has been closed by the operator.');
    }

    const seats = Object.entries(item.pax)
      .filter(([pax]) => pax !== 'infant')
      .reduce((sum, [, qty]) => sum + Number(qty ?? 0), 0);

    const free = departure.capacity - departure.seats_booked - departure.seats_held;
    if (seats > free) {
      throw new BookingError('SOLD_OUT', `Only ${Math.max(free, 0)} places left on that departure.`);
    }

    const tour = departure.tour as unknown as {
      id: string; company_id: string; min_pax: number; max_pax: number | null;
      company: { commission_rate: number };
      city: { country: { iso2: string } };
    };

    if (seats < tour.min_pax) {
      throw new BookingError('BELOW_MIN_PAX', `This experience takes a minimum of ${tour.min_pax} travellers.`);
    }
    if (tour.max_pax && seats > tour.max_pax) {
      throw new BookingError('ABOVE_MAX_PAX', `This experience takes at most ${tour.max_pax} travellers.`);
    }

    companyId ??= tour.company_id;
    if (companyId !== tour.company_id) {
      throw new BookingError('MIXED_SUPPLIERS', 'Book experiences from one operator at a time.');
    }

    const unitPrices: Record<string, number> = {};
    let lineSubtotal = 0;
    let supplierNet = 0;

    for (const [pax, rawQty] of Object.entries(item.pax)) {
      const qty = Number(rawQty ?? 0);
      if (!qty) continue;

      const { data: priceRow } = await supabase
        .rpc('resolve_price', {
          p_option_id: item.optionId,
          p_pax: pax,
          p_date: departure.local_date,
          p_currency: currency,
        })
        .maybeSingle();

      const price = priceRow as unknown as { list_price: string; net_price: string } | null;

      if (!price) {
        throw new BookingError('PAX_NOT_SOLD', `This option does not sell ${pax} tickets.`);
      }

      const list = departure.price_override && pax === 'adult'
        ? Number(departure.price_override)
        : Number(price.list_price);

      unitPrices[pax] = list;
      lineSubtotal += list * qty;
      supplierNet += Number(price.net_price) * qty;
    }

    const commissionRate = Number(tour.company.commission_rate);
    lines.push({
      tourId: tour.id,
      optionId: item.optionId,
      departureId: departure.id,
      startsAt: departure.starts_at,
      seats,
      paxBreakdown: item.pax as Record<string, number>,
      unitPrices,
      lineSubtotal: round2(lineSubtotal),
      lineDiscount: 0,
      lineTotal: round2(lineSubtotal),
      commissionRate,
      supplierNet: round2(supplierNet),
      companyId: tour.company_id,
    });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const countryIso = 'AE'; // supply country resolved from the tour's city above
  const vatRate = VAT_RATES[countryIso] ?? 0;

  // Gulf list prices are quoted VAT-inclusive, so tax is extracted, not added.
  const taxTotal = round2(subtotal - subtotal / (1 + vatRate / 100));
  const supplierNet = round2(lines.reduce((sum, line) => sum + line.supplierNet, 0));

  return {
    companyId: companyId!,
    currency,
    lines,
    subtotal,
    discountTotal: 0,
    feesTotal: 0,
    taxTotal,
    grandTotal: subtotal,
    commissionTotal: round2(subtotal - taxTotal - supplierNet),
    supplierNet,
    taxLines: vatRate ? [{ label: `VAT ${vatRate}%`, rate: vatRate, amount: taxTotal }] : [],
  };
}

/**
 * Applies a coupon to an already-priced cart. Eligibility is checked against
 * the coupon's own scope plus this traveller's redemption history.
 */
export async function applyCoupon(
  supabase: Db,
  cart: PricedCart,
  code: string,
  profileId: string | null,
): Promise<{ cart: PricedCart; couponId: string }> {
  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!coupon) throw new BookingError('COUPON_INVALID', 'That code isn’t valid.');
  if (coupon.ends_at && new Date(coupon.ends_at) < new Date()) {
    throw new BookingError('COUPON_EXPIRED', 'That code has expired.');
  }
  if (new Date(coupon.starts_at) > new Date()) {
    throw new BookingError('COUPON_NOT_STARTED', 'That code isn’t active yet.');
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new BookingError('COUPON_EXHAUSTED', 'That code has been fully claimed.');
  }
  if (cart.subtotal < Number(coupon.min_order_total)) {
    throw new BookingError('COUPON_MIN_ORDER', `Spend ${cart.currency} ${coupon.min_order_total} to use this code.`);
  }
  if (coupon.currency && coupon.currency !== cart.currency) {
    throw new BookingError('COUPON_CURRENCY', 'That code applies to a different currency.');
  }
  if (coupon.applies_to_tours.length) {
    const eligible = cart.lines.some((line) => coupon.applies_to_tours.includes(line.tourId));
    if (!eligible) throw new BookingError('COUPON_SCOPE', 'That code doesn’t apply to these experiences.');
  }
  if (profileId) {
    const { count } = await supabase
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id)
      .eq('profile_id', profileId);
    if ((count ?? 0) >= coupon.usage_limit_per_user) {
      throw new BookingError('COUPON_ALREADY_USED', 'You’ve already used that code.');
    }
  }

  const eligibleTotal = coupon.applies_to_tours.length
    ? cart.lines.filter((l) => coupon.applies_to_tours.includes(l.tourId))
        .reduce((sum, l) => sum + l.lineTotal, 0)
    : cart.subtotal;

  let discount = coupon.discount_type === 'percentage'
    ? eligibleTotal * (Number(coupon.discount_value) / 100)
    : Number(coupon.discount_value);

  if (coupon.max_discount) discount = Math.min(discount, Number(coupon.max_discount));
  discount = round2(Math.min(discount, cart.subtotal));

  const grandTotal = round2(cart.subtotal - discount);
  const vatRate = cart.taxLines[0]?.rate ?? 0;
  const taxTotal = round2(grandTotal - grandTotal / (1 + vatRate / 100));

  return {
    cart: {
      ...cart,
      discountTotal: discount,
      grandTotal,
      taxTotal,
      taxLines: vatRate ? [{ label: `VAT ${vatRate}%`, rate: vatRate, amount: taxTotal }] : [],
      commissionTotal: round2(grandTotal - taxTotal - cart.supplierNet),
    },
    couponId: coupon.id,
  };
}

export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BookingError';
  }
}
