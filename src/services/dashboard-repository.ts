import 'server-only';
import { cache } from 'react';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type DashboardTour = {
  id: string; title: string; slug: string; status: string;
  completeness: number; mediaCount: number; futureDepartures: number;
  seatsAvailable: number; fromPrice: number; currency: string;
  ratingAvg: number; ratingCount: number; bookingCount: number;
  metaTitle: string | null; metaDescription: string | null;
  rejectedReason: string | null; updatedAt: string;
};

export type DashboardKpis = {
  currency: string;
  grossThisMonth: number; netThisMonth: number; commissionThisMonth: number;
  bookingsThisMonth: number; bookingsLastMonth: number;
  upcomingDepartures: number; seatsToFill: number;
  pendingReviews: number; liveTours: number; draftTours: number; inReviewTours: number;
};

/**
 * Everything the dashboard overview shows.
 *
 * Runs under the caller's session, so RLS decides which company's rows come
 * back. If a supplier tampers with the company id in the URL, they get an
 * empty dashboard rather than a competitor's revenue.
 */
export const getDashboardData = cache(async (companyId: string, locale: Locale) => {
  if (!isDatabaseConfigured()) return null;
  const supabase = await getSupabaseServerClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  const [toursRes, statsRes, bookingsRes, reviewsRes] = await Promise.all([
    supabase.from('supplier_tour_rows').select('*')
      .eq('company_id', companyId).eq('locale', locale)
      .order('updated_at', { ascending: false }),
    supabase.from('supplier_daily_stats').select('*')
      .eq('company_id', companyId)
      .gte('day', lastMonthStart.toISOString().slice(0, 10)),
    supabase.from('bookings')
      .select('id, reference, status, guest_name, grand_total, currency, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('reviews')
      .select('id, rating, title, body, created_at, supplier_reply, tour_id')
      .eq('company_id', companyId).eq('status', 'published')
      .is('supplier_reply', null)
      .order('created_at', { ascending: false }).limit(5),
  ]);

  const tourRows = (toursRes.data ?? []) as unknown as Array<Record<string, any>>;
  const statRows = (statsRes.data ?? []) as unknown as Array<Record<string, any>>;

  const thisMonth = statRows.filter((r) => new Date(r.day) >= monthStart);
  const lastMonth = statRows.filter((r) => new Date(r.day) < monthStart);
  const sum = (rows: Array<Record<string, any>>, key: string) =>
    rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

  const tours: DashboardTour[] = tourRows.map((row) => ({
    id: String(row.id), title: String(row.title ?? 'Untitled listing'),
    slug: String(row.slug ?? ''), status: String(row.status),
    completeness: Number(row.completeness_score ?? 0),
    mediaCount: Number(row.media_count ?? 0),
    futureDepartures: Number(row.future_departures ?? 0),
    seatsAvailable: Number(row.seats_available ?? 0),
    fromPrice: Number(row.from_price ?? 0), currency: String(row.base_currency ?? 'AED'),
    ratingAvg: Number(row.rating_avg ?? 0), ratingCount: Number(row.rating_count ?? 0),
    bookingCount: Number(row.booking_count ?? 0),
    metaTitle: row.meta_title ?? null, metaDescription: row.meta_description ?? null,
    rejectedReason: row.rejected_reason ?? null, updatedAt: String(row.updated_at),
  }));

  const kpis: DashboardKpis = {
    currency: String(statRows[0]?.currency ?? tours[0]?.currency ?? 'AED'),
    grossThisMonth: sum(thisMonth, 'gross'),
    netThisMonth: sum(thisMonth, 'net'),
    commissionThisMonth: sum(thisMonth, 'commission'),
    bookingsThisMonth: sum(thisMonth, 'bookings'),
    bookingsLastMonth: sum(lastMonth, 'bookings'),
    upcomingDepartures: tours.reduce((t, tour) => t + tour.futureDepartures, 0),
    seatsToFill: tours.reduce((t, tour) => t + tour.seatsAvailable, 0),
    pendingReviews: (reviewsRes.data ?? []).length,
    liveTours: tours.filter((t) => t.status === 'published').length,
    draftTours: tours.filter((t) => t.status === 'draft' || t.status === 'rejected').length,
    inReviewTours: tours.filter((t) => t.status === 'in_review').length,
  };

  return {
    tours,
    kpis,
    recentBookings: ((bookingsRes.data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
      id: String(row.id), reference: String(row.reference), status: String(row.status),
      guestName: String(row.guest_name), total: Number(row.grand_total),
      currency: String(row.currency), createdAt: String(row.created_at),
    })),
    unansweredReviews: ((reviewsRes.data ?? []) as unknown as Array<Record<string, any>>).map((row) => ({
      id: String(row.id), rating: Number(row.rating), title: row.title ?? null,
      body: row.body ?? null, createdAt: String(row.created_at),
    })),
  };
});

/** Resolves a company slug to its id, and confirms the caller can act for it. */
export const getCompanyBySlug = cache(async (slug: string) => {
  if (!isDatabaseConfigured()) return null;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('companies')
    .select('id, slug, display_name, status, commission_rate, payout_currency, verification')
    .eq('slug', slug).maybeSingle();
  return (data as unknown as Record<string, any>) ?? null;
});

/** A single listing plus everything the editor needs to render its tabs. */
export const getTourForEditor = cache(async (tourId: string, locale: Locale) => {
  if (!isDatabaseConfigured()) return null;
  const supabase = await getSupabaseServerClient();

  const [tourRes, translationRes, optionsRes, mediaRes, completenessRes] = await Promise.all([
    supabase.from('tours').select('*').eq('id', tourId).maybeSingle(),
    supabase.from('tour_translations').select('*').eq('tour_id', tourId).eq('locale', locale).maybeSingle(),
    supabase.from('tour_options')
      .select('id, code, is_active, max_pax, prices:tour_prices ( pax, currency, list_price, net_price )')
      .eq('tour_id', tourId).order('position'),
    supabase.from('tour_media').select('media_id, position, is_cover, alt_text, media:media_assets ( url )')
      .eq('tour_id', tourId).order('position'),
    supabase.rpc('tour_completeness', { p_tour_id: tourId }),
  ]);

  if (!tourRes.data) return null;

  // The RPC returns a set, so supabase-js may hand back a row or an array
  // of one depending on how it was called.
  type Completeness = { score: number; missing: string[] };
  const raw = completenessRes.data as unknown;
  const completeness = (Array.isArray(raw) ? raw[0] : raw) as Completeness | null;

  return {
    tour: tourRes.data as unknown as Record<string, any>,
    translation: (translationRes.data ?? null) as unknown as Record<string, any> | null,
    options: (optionsRes.data ?? []) as unknown as Array<Record<string, any>>,
    media: (mediaRes.data ?? []) as unknown as Array<Record<string, any>>,
    completeness: { score: completeness?.score ?? 0, missing: completeness?.missing ?? [] },
  };
});
