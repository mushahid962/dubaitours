-- =====================================================================
-- 0003_catalog.sql
-- Tours/experiences, options (ticket types), pricing, and inventory.
-- Inventory is modelled as departures so capacity can be locked per row.
-- =====================================================================

create table tours (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  city_id             uuid not null references cities(id) on delete restrict,
  area_id             uuid references areas(id) on delete set null,
  primary_category_id uuid not null references categories(id) on delete restrict,
  status              listing_status not null default 'draft',
  tour_type           tour_type not null default 'group',
  confirmation        confirmation_type not null default 'instant',
  cancellation        cancellation_policy not null default 'moderate_48h',

  duration_minutes    integer not null check (duration_minutes > 0),
  duration_days       smallint not null default 1,
  min_pax             smallint not null default 1,
  max_pax             smallint,
  min_age             smallint,
  max_age             smallint,
  day_parts           day_part[] not null default '{}',

  meeting_point       geography(point, 4326),
  meeting_address     text,
  dropoff_address     text,
  pickup_included     boolean not null default false,
  pickup_radius_m     integer,
  wheelchair_accessible boolean not null default false,
  family_friendly     boolean not null default true,
  is_luxury           boolean not null default false,
  is_private          boolean not null default false,

  guide_locales       locale_code[] not null default '{en}',
  audio_guide_locales locale_code[] not null default '{}',

  -- Denormalised commercial fields: read-hot, written by triggers/jobs.
  base_currency       currency_code not null default 'AED',
  from_price          numeric(12,2) not null default 0,
  compare_at_price    numeric(12,2),
  discount_pct        smallint generated always as (
                        case when compare_at_price is null or compare_at_price <= 0 then 0
                             else floor(((compare_at_price - from_price) / compare_at_price) * 100)::smallint end
                      ) stored,
  rating_avg          numeric(3,2) not null default 0,
  rating_count        integer not null default 0,
  booking_count       integer not null default 0,
  view_count          integer not null default 0,
  popularity_score    numeric(10,4) not null default 0,   -- recomputed nightly

  published_at        timestamptz,
  rejected_reason     text,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tours_pax_range check (max_pax is null or max_pax >= min_pax)
);
create index tours_city_status_idx on tours (city_id, status) where status = 'published';
create index tours_company_idx on tours (company_id);
create index tours_category_idx on tours (primary_category_id) where status = 'published';
create index tours_popularity_idx on tours (popularity_score desc) where status = 'published';
create index tours_price_idx on tours (from_price) where status = 'published';
create index tours_meeting_gix on tours using gist (meeting_point);

-- Many-to-many: a desert safari lives in Adventure, Desert and Family.
create table tour_categories (
  tour_id     uuid not null references tours(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (tour_id, category_id)
);
create index tour_categories_category_idx on tour_categories (category_id);

create table tour_translations (
  tour_id           uuid not null references tours(id) on delete cascade,
  locale            locale_code not null,
  title             text not null,
  slug              text not null,
  summary           text,
  description       text,
  highlights        text[] not null default '{}',
  inclusions        text[] not null default '{}',
  exclusions        text[] not null default '{}',
  what_to_bring     text[] not null default '{}',
  know_before_you_go text,
  meeting_instructions text,
  cancellation_text text,
  meta_title        text,
  meta_description  text,
  translated_by     text not null default 'human' check (translated_by in ('human','ai','ai_reviewed')),
  primary key (tour_id, locale)
);
create unique index tour_slug_uq on tour_translations (locale, slug);

create table tour_itinerary (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references tours(id) on delete cascade,
  position    smallint not null,
  duration_minutes integer,
  poi_id      uuid references points_of_interest(id) on delete set null,
  location    geography(point, 4326),
  admission_included boolean not null default false,
  unique (tour_id, position)
);

create table tour_itinerary_translations (
  itinerary_id uuid not null references tour_itinerary(id) on delete cascade,
  locale       locale_code not null,
  title        text not null,
  description  text,
  primary key (itinerary_id, locale)
);

create table tour_faqs (
  id       uuid primary key default gen_random_uuid(),
  tour_id  uuid not null references tours(id) on delete cascade,
  position smallint not null default 0,
  source   text not null default 'supplier' check (source in ('supplier','ai','support','paa')),
  is_published boolean not null default true
);

create table tour_faq_translations (
  faq_id   uuid not null references tour_faqs(id) on delete cascade,
  locale   locale_code not null,
  question text not null,
  answer   text not null,
  primary key (faq_id, locale)
);

create table media_assets (
  id            uuid primary key default gen_random_uuid(),
  kind          media_kind not null default 'image',
  provider      text not null default 'cloudinary',
  public_id     text not null,
  url           text not null,
  width         integer,
  height        integer,
  duration_s    integer,
  blurhash      text,
  bytes         bigint,
  content_hash  text,                       -- dedupe identical uploads
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index media_provider_public_id_uq on media_assets (provider, public_id);

create table tour_media (
  tour_id   uuid not null references tours(id) on delete cascade,
  media_id  uuid not null references media_assets(id) on delete cascade,
  position  smallint not null default 0,
  is_cover  boolean not null default false,
  alt_text  jsonb not null default '{}'::jsonb,  -- {"en": "...", "ar": "..."} — image SEO
  primary key (tour_id, media_id)
);
create unique index tour_single_cover_uq on tour_media (tour_id) where is_cover;

create table tour_pickup_points (
  id        uuid primary key default gen_random_uuid(),
  tour_id   uuid not null references tours(id) on delete cascade,
  poi_id    uuid references points_of_interest(id) on delete set null,
  label     text not null,
  location  geography(point, 4326) not null,
  window_minutes smallint not null default 30,
  surcharge numeric(10,2) not null default 0
);
create index tour_pickup_tour_idx on tour_pickup_points (tour_id);

-- ---------------------------------------------------------------------
-- OPTIONS & PRICING
-- A tour has options (Standard / Premium / Private transfer). Each option
-- prices per pax type. Price rules layer seasonal and group overrides.
-- ---------------------------------------------------------------------
create table tour_options (
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null references tours(id) on delete cascade,
  code            text not null,
  position        smallint not null default 0,
  duration_minutes integer,
  max_pax         smallint,
  is_private      boolean not null default false,
  is_active       boolean not null default true,
  unique (tour_id, code)
);

create table tour_option_translations (
  option_id   uuid not null references tour_options(id) on delete cascade,
  locale      locale_code not null,
  name        text not null,
  description text,
  primary key (option_id, locale)
);

create table tour_prices (
  id          uuid primary key default gen_random_uuid(),
  option_id   uuid not null references tour_options(id) on delete cascade,
  pax         pax_type not null,
  currency    currency_code not null default 'AED',
  net_price   numeric(12,2) not null check (net_price >= 0),  -- supplier receives
  list_price  numeric(12,2) not null check (list_price >= 0), -- traveler pays
  min_qty     smallint not null default 0,
  max_qty     smallint,
  unique (option_id, pax, currency)
);

-- Seasonal / weekend / early-bird overrides, resolved by highest priority.
create table price_rules (
  id           uuid primary key default gen_random_uuid(),
  option_id    uuid not null references tour_options(id) on delete cascade,
  pax          pax_type,
  valid_range  daterange not null,
  weekdays     smallint[] not null default '{0,1,2,3,4,5,6}',
  adjust_type  discount_type not null default 'percentage',
  adjust_value numeric(12,2) not null,
  priority     smallint not null default 0,
  is_active    boolean not null default true
);
create index price_rules_option_idx on price_rules (option_id) where is_active;

-- ---------------------------------------------------------------------
-- INVENTORY
-- Recurrence template -> materialised departures (the lockable rows).
-- ---------------------------------------------------------------------
create table tour_schedules (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references tours(id) on delete cascade,
  option_id     uuid references tour_options(id) on delete cascade,
  rrule         text not null,             -- iCal RRULE, e.g. FREQ=DAILY;BYHOUR=16
  start_time    time not null,
  capacity      integer not null check (capacity > 0),
  valid_range   daterange not null,
  timezone      text not null default 'Asia/Dubai',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table tour_departures (
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid not null references tours(id) on delete cascade,
  option_id      uuid not null references tour_options(id) on delete cascade,
  schedule_id    uuid references tour_schedules(id) on delete set null,
  starts_at      timestamptz not null,
  local_date     date not null,
  capacity       integer not null check (capacity >= 0),
  seats_held     integer not null default 0 check (seats_held >= 0),
  seats_booked   integer not null default 0 check (seats_booked >= 0),
  price_override numeric(12,2),
  is_closed      boolean not null default false,
  updated_at     timestamptz not null default now(),
  constraint departures_capacity_not_exceeded check (seats_booked + seats_held <= capacity),
  unique (option_id, starts_at)
);
create index departures_lookup_idx on tour_departures (tour_id, local_date) where not is_closed;
create index departures_availability_idx on tour_departures (option_id, starts_at)
  where not is_closed;

create trigger touch_tours before update on tours for each row execute function internal.touch_updated_at();
create trigger touch_departures before update on tour_departures for each row execute function internal.touch_updated_at();
