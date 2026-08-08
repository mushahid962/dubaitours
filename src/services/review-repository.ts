import 'server-only';
import { cache } from 'react';
import { getSupabasePublicClient } from '@/lib/supabase/server';
import type { Locale } from '@/lib/i18n/config';

export type TourReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string;
  travellerType: string | null;
  travelledOn: string | null;
  createdAt: string;
  isVerified: boolean;
  supplierReply: string | null;
  photos: string[];
};

export type ReviewSummary = {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  aiSummary: { summary: string; pros: string[]; cons: string[]; sourceCount: number } | null;
};

export const getTourReviews = cache(async (tourId: string, locale: Locale, limit = 10) => {
  const supabase = getSupabasePublicClient();

  const { data } = await supabase
    .from('reviews')
    .select(`
      id, rating, title, body, traveller_type:traveler_type, travelled_on, created_at,
      booking_item_id, supplier_reply,
      profile:profiles ( display_name, full_name ),
      media:review_media ( media:media_assets ( url ) )
    `)
    .eq('tour_id', tourId)
    .eq('status', 'published')
    .order('helpful_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row): TourReview => {
    const profile = row.profile as never as { display_name: string | null; full_name: string | null } | null;
    return {
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      // Only a first name is ever published, whatever the profile holds.
      authorName: firstNameOnly(profile?.display_name ?? profile?.full_name ?? 'Traveller'),
      travellerType: row.traveller_type,
      travelledOn: row.travelled_on,
      createdAt: row.created_at,
      // The badge is a fact from the schema, not a marketing claim: RLS only
      // accepts a review attached to a completed booking.
      isVerified: row.booking_item_id !== null,
      supplierReply: row.supplier_reply,
      photos: (row.media as never as Array<{ media: { url: string } }>).map((m) => m.media.url),
    };
  });
});

export const getReviewSummary = cache(async (tourId: string, locale: Locale): Promise<ReviewSummary> => {
  const supabase = getSupabasePublicClient();

  const [{ data: ratings }, { data: ai }] = await Promise.all([
    supabase.from('reviews').select('rating').eq('tour_id', tourId).eq('status', 'published'),
    supabase.from('review_summaries').select('summary, pros, cons, source_count')
      .eq('tour_id', tourId).eq('locale', locale).maybeSingle(),
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const row of ratings ?? []) distribution[row.rating as 1 | 2 | 3 | 4 | 5] += 1;

  const count = ratings?.length ?? 0;
  const average = count
    ? Math.round(((ratings ?? []).reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
    : 0;

  return {
    average,
    count,
    distribution,
    aiSummary: ai
      ? { summary: ai.summary, pros: ai.pros ?? [], cons: ai.cons ?? [], sourceCount: ai.source_count }
      : null,
  };
});

const firstNameOnly = (name: string) => name.trim().split(/\s+/)[0] ?? 'Traveller';
