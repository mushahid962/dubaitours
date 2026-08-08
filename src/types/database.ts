/**
 * Generated types live here.
 *
 *   pnpm db:types
 *   → supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" \
 *       --schema public > src/types/database.ts
 *
 * Run it in CI on every migration and fail the build on a diff: a schema
 * change that nobody typed is a runtime error waiting for production.
 *
 * The declarations below are the hand-written domain aliases the app codes
 * against, so feature code never reaches into the generated tree directly.
 */
import type { Database as Generated } from './database.generated';

export type Database = Generated;

type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];

export type Tour = Row<'tours'>;
export type TourTranslation = Row<'tour_translations'>;
export type Booking = Row<'bookings'>;
export type BookingItem = Row<'booking_items'>;
export type Company = Row<'companies'>;
export type Review = Row<'reviews'>;
export type Profile = Row<'profiles'>;

export type BookingStatus = Enums['booking_status'];
export type ListingStatus = Enums['listing_status'];
export type PaxType = Enums['pax_type'];
export type UserRole = Enums['user_role'];

/** A published tour joined with everything the detail page renders. */
export type TourDetail = Tour & {
  translation: TourTranslation;
  company: Pick<Company, 'id' | 'slug' | 'display_name' | 'logo_url' | 'verification' | 'rating_avg'>;
  media: Array<{ url: string; alt: string; width: number | null; height: number | null; blurhash: string | null }>;
  options: Array<Row<'tour_options'> & { name: string; prices: Row<'tour_prices'>[] }>;
  faqs: Array<{ question: string; answer: string }>;
  itinerary: Array<{ position: number; title: string; description: string | null; durationMinutes: number | null }>;
};
