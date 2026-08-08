/**
 * PLACEHOLDER — replaced on the first `pnpm db:types`.
 *
 *   supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" \
 *     --schema public > src/types/database.generated.ts
 *
 * This stub exists so the repository type-checks before anyone has connected
 * a Supabase project. It types every table loosely, which means the compiler
 * will not catch schema mistakes until the real file lands — run the generator
 * before the first build, and in CI on every migration.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LooseTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, LooseTable>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      user_role: 'traveler' | 'company_owner' | 'company_staff' | 'editor' | 'support' | 'admin' | 'super_admin';
      booking_status: 'pending' | 'awaiting_payment' | 'confirmed' | 'on_hold' | 'completed'
        | 'cancelled_by_user' | 'cancelled_by_supplier' | 'expired' | 'no_show';
      listing_status: 'draft' | 'in_review' | 'published' | 'paused' | 'rejected' | 'archived';
      pax_type: 'adult' | 'child' | 'infant' | 'senior' | 'student' | 'group' | 'vehicle';
      payment_provider: 'stripe' | 'paypal' | 'apple_pay' | 'google_pay' | 'tap' | 'hyperpay'
        | 'telr' | 'network_intl' | 'wallet' | 'bank_transfer' | 'cash_on_arrival';
      cancellation_policy: 'flexible_24h' | 'moderate_48h' | 'standard_72h' | 'strict' | 'non_refundable';
      locale_code: 'en' | 'ar' | 'hi' | 'ur' | 'fr' | 'ru' | 'de' | 'zh';
      currency_code: 'AED' | 'SAR' | 'QAR' | 'OMR' | 'BHD' | 'KWD' | 'USD' | 'EUR' | 'GBP' | 'INR' | 'PKR';
    };
    CompositeTypes: Record<string, never>;
  };
};
