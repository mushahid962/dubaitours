-- =====================================================================
-- 0001_extensions_enums.sql
-- TravelHub Gulf — foundational extensions, schemas and enumerations.
-- =====================================================================

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- fuzzy search / autocomplete
create extension if not exists "unaccent";       -- accent-insensitive search (Arabic/Latin)
create extension if not exists "btree_gist";     -- exclusion constraints on ranges
create extension if not exists "postgis";       -- geospatial "near me" queries
create extension if not exists "citext";         -- case-insensitive emails
create extension if not exists "ltree";          -- category tree paths
create extension if not exists "pg_stat_statements";

-- Internal helper namespace: never exposed through PostgREST.
create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------
create type user_role as enum (
  'traveler', 'company_owner', 'company_staff', 'editor', 'support', 'admin', 'super_admin'
);

create type company_status as enum ('pending', 'active', 'suspended', 'rejected', 'archived');
create type verification_tier as enum ('none', 'verified', 'premium', 'elite');

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create type listing_status as enum ('draft', 'in_review', 'published', 'paused', 'rejected', 'archived');
create type tour_type as enum ('private', 'group', 'self_guided', 'ticket_only', 'transfer', 'multi_day');
create type confirmation_type as enum ('instant', 'manual', 'on_request');
create type cancellation_policy as enum ('flexible_24h', 'moderate_48h', 'standard_72h', 'strict', 'non_refundable');
create type pax_type as enum ('adult', 'child', 'infant', 'senior', 'student', 'group', 'vehicle');
create type day_part as enum ('morning', 'afternoon', 'evening', 'night', 'full_day');

-- ---------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------
create type booking_status as enum (
  'pending', 'awaiting_payment', 'confirmed', 'on_hold', 'completed',
  'cancelled_by_user', 'cancelled_by_supplier', 'expired', 'no_show'
);
create type payment_status as enum ('initiated', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'disputed');
create type payment_provider as enum ('stripe', 'paypal', 'apple_pay', 'google_pay', 'tap', 'hyperpay', 'telr', 'network_intl', 'wallet', 'bank_transfer', 'cash_on_arrival');
create type payout_status as enum ('scheduled', 'processing', 'paid', 'failed', 'on_hold');
create type discount_type as enum ('percentage', 'fixed_amount', 'free_pax');
create type wallet_txn_type as enum ('topup', 'booking_payment', 'refund', 'reward', 'referral', 'adjustment', 'expiry');

-- ---------------------------------------------------------------------
-- Content, SEO & monetization
-- ---------------------------------------------------------------------
create type content_status as enum ('draft', 'scheduled', 'published', 'archived');
create type review_status as enum ('pending', 'published', 'rejected', 'flagged');
create type ad_placement as enum (
  'home_hero', 'home_billboard', 'search_inline', 'listing_sidebar', 'tour_detail',
  'category_top', 'blog_native', 'newsletter', 'popup', 'sticky_footer'
);
create type ad_pricing_model as enum ('cpm', 'cpc', 'flat_monthly', 'flat_weekly');
create type feature_slot as enum ('homepage', 'country', 'city', 'category', 'search_top', 'top_picks', 'related');
create type media_kind as enum ('image', 'video', 'virtual_tour', 'document');

-- ---------------------------------------------------------------------
-- i18n — one enum keeps locale integrity across every translation table.
-- ---------------------------------------------------------------------
create type locale_code as enum ('en', 'ar', 'hi', 'ur', 'fr', 'ru', 'de', 'zh');
create type currency_code as enum ('AED', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'USD', 'EUR', 'GBP', 'INR', 'PKR');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without trusting the client.
-- ---------------------------------------------------------------------
create or replace function internal.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Slugify helper used by translation tables and programmatic SEO routes.
create or replace function internal.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(public.unaccent('public.unaccent'::regdictionary, coalesce(input, ''))),
      '[^a-z0-9\u0600-\u06FF\u0900-\u097F]+', '-', 'g'
    )
  );
$$;
