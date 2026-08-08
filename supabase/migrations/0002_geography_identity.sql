-- =====================================================================
-- 0002_geography_identity.sql
-- Destinations (the SEO backbone), user profiles and supplier companies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GEOGRAPHY
-- Countries > cities > areas > points of interest.
-- Every level is independently indexable => programmatic SEO surface.
-- ---------------------------------------------------------------------
create table countries (
  id            uuid primary key default gen_random_uuid(),
  iso2          char(2) not null unique,
  iso3          char(3) not null unique,
  dial_code     text not null,
  currency      currency_code not null,
  timezone      text not null,
  centroid      geography(point, 4326) not null,
  bounds        geography(polygon, 4326),
  flag_emoji    text,
  is_active     boolean not null default true,
  is_launched   boolean not null default false,   -- controls sitemap inclusion
  priority      smallint not null default 0,      -- editorial ordering
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table country_translations (
  country_id        uuid not null references countries(id) on delete cascade,
  locale            locale_code not null,
  name              text not null,
  slug              text not null,
  tagline           text,
  intro             text,                          -- 120-200 words, above the fold
  body              text,                          -- long-form destination guide
  meta_title        text,
  meta_description  text,
  primary key (country_id, locale)
);
create unique index country_slug_uq on country_translations (locale, slug);

create table cities (
  id             uuid primary key default gen_random_uuid(),
  country_id     uuid not null references countries(id) on delete restrict,
  centroid       geography(point, 4326) not null,
  timezone       text not null,
  population     integer,
  is_active      boolean not null default true,
  is_featured    boolean not null default false,
  priority       smallint not null default 0,
  hero_image_url text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index cities_country_idx on cities (country_id) where is_active;
create index cities_centroid_gix on cities using gist (centroid);

create table city_translations (
  city_id           uuid not null references cities(id) on delete cascade,
  locale            locale_code not null,
  name              text not null,
  slug              text not null,
  tagline           text,
  intro             text,
  body              text,
  best_time_to_visit text,
  getting_around    text,
  meta_title        text,
  meta_description  text,
  primary key (city_id, locale)
);
create unique index city_slug_uq on city_translations (locale, slug);

create table areas (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references cities(id) on delete cascade,
  centroid    geography(point, 4326) not null,
  radius_m    integer not null default 3000,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index areas_city_idx on areas (city_id);

create table area_translations (
  area_id  uuid not null references areas(id) on delete cascade,
  locale   locale_code not null,
  name     text not null,
  slug     text not null,
  intro    text,
  primary key (area_id, locale)
);
create unique index area_slug_uq on area_translations (locale, slug);

-- Attractions, restaurants and hotels power the "nearby" modules on tour pages.
create table points_of_interest (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references cities(id) on delete cascade,
  area_id      uuid references areas(id) on delete set null,
  kind         text not null check (kind in ('attraction','restaurant','hotel','landmark','mall','beach','park','museum')),
  location     geography(point, 4326) not null,
  address      text,
  rating       numeric(2,1) check (rating between 0 and 5),
  external_ref jsonb not null default '{}'::jsonb,  -- {google_place_id, mapbox_id, ...}
  image_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index poi_location_gix on points_of_interest using gist (location);
create index poi_city_kind_idx on points_of_interest (city_id, kind) where is_active;

create table poi_translations (
  poi_id   uuid not null references points_of_interest(id) on delete cascade,
  locale   locale_code not null,
  name     text not null,
  slug     text not null,
  summary  text,
  primary key (poi_id, locale)
);
create unique index poi_slug_uq on poi_translations (locale, slug);

-- ---------------------------------------------------------------------
-- CATEGORIES — self-referencing tree (Adventure > Desert > Dune Buggy)
-- ---------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete restrict,
  depth       smallint not null default 0,
  path        ltree,                                -- materialised tree path
  icon        text,
  hero_image_url text,
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  priority    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_parent_idx on categories (parent_id);

create table category_translations (
  category_id       uuid not null references categories(id) on delete cascade,
  locale            locale_code not null,
  name              text not null,
  slug              text not null,
  intro             text,
  body              text,
  meta_title        text,
  meta_description  text,
  primary key (category_id, locale)
);
create unique index category_slug_uq on category_translations (locale, slug);

-- ---------------------------------------------------------------------
-- IDENTITY — profiles mirror auth.users; never store passwords here.
-- ---------------------------------------------------------------------
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              user_role not null default 'traveler',
  full_name         text,
  display_name      text,
  avatar_url        text,
  phone             text,
  phone_verified    boolean not null default false,
  preferred_locale  locale_code not null default 'en',
  preferred_currency currency_code not null default 'AED',
  country_id        uuid references countries(id) on delete set null,
  date_of_birth     date,
  marketing_opt_in  boolean not null default false,
  referral_code     text unique,
  referred_by       uuid references profiles(id) on delete set null,
  loyalty_points    integer not null default 0 check (loyalty_points >= 0),
  last_seen_at      timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_role_idx on profiles (role) where deleted_at is null;

-- Author identity for EEAT: bylines, credentials, destination expertise.
create table authors (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references profiles(id) on delete set null,
  slug          text not null unique,
  name          text not null,
  headline      text,
  bio           text,
  avatar_url    text,
  credentials   text[] not null default '{}',
  expertise_city_ids uuid[] not null default '{}',
  social        jsonb not null default '{}'::jsonb,  -- {x, linkedin, instagram}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SUPPLIERS
-- ---------------------------------------------------------------------
create table companies (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  legal_name         text not null,
  display_name       text not null,
  status             company_status not null default 'pending',
  verification       verification_tier not null default 'none',
  country_id         uuid not null references countries(id) on delete restrict,
  city_id            uuid references cities(id) on delete set null,
  logo_url           text,
  cover_url          text,
  about              text,
  contact_email      citext not null,
  contact_phone      text,
  whatsapp           text,
  website            text,
  trade_license_no   text,
  trade_license_url  text,
  tax_registration_no text,
  commission_rate    numeric(5,2) not null default 20.00 check (commission_rate between 0 and 100),
  payout_currency    currency_code not null default 'AED',
  payout_details     jsonb not null default '{}'::jsonb,   -- encrypted at the app layer
  stripe_account_id  text,
  rating_avg         numeric(3,2) not null default 0,
  rating_count       integer not null default 0,
  response_time_mins integer,
  onboarded_at       timestamptz,
  suspended_reason   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index companies_status_idx on companies (status);
create index companies_city_idx on companies (city_id) where status = 'active';

create table company_members (
  company_id  uuid not null references companies(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  role        user_role not null default 'company_staff',
  permissions text[] not null default '{}',   -- fine-grained: tours.write, payouts.read
  invited_by  uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (company_id, profile_id)
);
create index company_members_profile_idx on company_members (profile_id);

create trigger touch_countries before update on countries for each row execute function internal.touch_updated_at();
create trigger touch_cities    before update on cities    for each row execute function internal.touch_updated_at();
create trigger touch_profiles  before update on profiles  for each row execute function internal.touch_updated_at();
create trigger touch_companies before update on companies for each row execute function internal.touch_updated_at();

-- Auto-provision a profile whenever Supabase Auth creates a user.
create or replace function internal.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function internal.handle_new_user();
