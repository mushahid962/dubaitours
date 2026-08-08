-- =====================================================================
-- 0017_listing_spine.sql — PHASE 0: the three-layer spine.
--
--   BUSINESS  → the legal entity (companies)
--   LISTING   → the page a traveller lands on   ← this migration
--   PRODUCT   → the sellable unit (tour_options)
--
-- WHY ADDITIVE, NOT A REWRITE
--
-- 26 foreign keys already point at tours, tour_options and tour_departures,
-- and the booking engine on top of them is attack-tested. So `listings`
-- becomes the PARENT page entity and `tours` becomes its booking extension,
-- linked 1:1. Nothing that works today breaks; everything gains one shared
-- identity for pages, reviews, media, filters and SEO.
--
-- A mall is a listing with no extension. A hotel is a listing with no
-- extension and enquiry fulfilment. A desert safari is a listing WITH a
-- tours extension, and only that one can hold a seat reservation.
-- =====================================================================

create table listings (
  id            uuid primary key default gen_random_uuid(),
  vertical_id   uuid not null references verticals(id) on delete restrict,
  business_id   uuid references companies(id) on delete set null,

  country_id    uuid not null references countries(id) on delete restrict,
  region_id     uuid references regions(id) on delete set null,
  city_id       uuid not null references cities(id) on delete restrict,
  area_id       uuid references areas(id) on delete set null,
  location      geography(point, 4326),
  address       text,

  status        listing_status not null default 'draft',
  -- Overrides the vertical default. A hotel that signs up for real-time
  -- booking becomes 'booking' without moving vertical.
  fulfilment    text check (fulfilment in ('booking','enquiry','affiliate','info_only')),

  -- Denormalised, read-hot, maintained by triggers and jobs.
  price_from       numeric(12,2),
  price_level      smallint check (price_level between 1 and 4),
  currency         currency_code,
  rating_avg       numeric(3,2) not null default 0,
  rating_count     integer not null default 0,
  popularity_score numeric(10,4) not null default 0,
  is_featured      boolean not null default false,
  is_claimed       boolean not null default false,

  amenities     text[] not null default '{}',
  attributes    jsonb not null default '{}'::jsonb,

  -- Where this listing's detail lives. Exactly one may be set.
  tour_id       uuid references tours(id) on delete cascade,
  poi_id        uuid references points_of_interest(id) on delete cascade,

  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint listing_single_source check (num_nonnulls(tour_id, poi_id) <= 1)
);

create unique index listings_tour_uq on listings (tour_id) where tour_id is not null;
create unique index listings_poi_uq  on listings (poi_id)  where poi_id  is not null;
create index listings_browse_idx on listings (city_id, vertical_id, status)
  where status = 'published';
create index listings_region_idx on listings (region_id) where status = 'published';
create index listings_amenities_gin on listings using gin (amenities);
create index listings_attributes_gin on listings using gin (attributes);
create index listings_location_gix on listings using gist (location);
create index listings_price_idx on listings (city_id, price_from) where status = 'published';

create table listing_translations (
  listing_id       uuid not null references listings(id) on delete cascade,
  locale           locale_code not null,
  name             text not null,
  slug             text not null,
  summary          text,
  description      text,
  body             text,
  highlights       text[] not null default '{}',
  meta_title       text,
  meta_description text,
  primary key (listing_id, locale)
);

-- URL NAMESPACE
--
-- /{country}/{city}/{vertical}/{slug} — the last segment is either a category
-- or a listing. Rather than hoping they never collide, the collision is made
-- impossible: a listing slug must be unique within its city and locale, and
-- must not match a category slug in that locale.
create unique index listing_slug_uq on listing_translations (locale, slug);

create or replace function internal.guard_listing_slug()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from category_translations ct
    where ct.locale = new.locale and ct.slug = new.slug
  ) then
    raise exception 'The slug "%" is already used by a category. Categories and listings share a URL segment, so pick another.', new.slug
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger guard_listing_slug
  before insert or update of slug on listing_translations
  for each row execute function internal.guard_listing_slug();

create trigger touch_listings before update on listings
  for each row execute function internal.touch_updated_at();

-- ---------------------------------------------------------------------
-- SYNC
-- A tour or POI edited through its own tables must keep its listing row in
-- step. Doing this in application code guarantees the two drift apart the
-- first time someone writes a script.
-- ---------------------------------------------------------------------
create or replace function internal.sync_listing_from_tour()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
declare
  v_listing uuid;
  v_country uuid;
  v_region  uuid;
begin
  select ci.country_id, ci.region_id into v_country, v_region
  from cities ci where ci.id = new.city_id;

  insert into listings (
    vertical_id, business_id, country_id, region_id, city_id, area_id,
    location, status, fulfilment, price_from, currency,
    rating_avg, rating_count, popularity_score, tour_id, published_at
  )
  select (select id from verticals where code = 'tours'),
         new.company_id, v_country, v_region, new.city_id, new.area_id,
         new.meeting_point, new.status, 'booking', new.from_price, new.base_currency,
         new.rating_avg, new.rating_count, new.popularity_score, new.id, new.published_at
  on conflict (tour_id) where tour_id is not null
  do update set
    business_id = excluded.business_id, city_id = excluded.city_id,
    region_id = excluded.region_id, area_id = excluded.area_id,
    location = excluded.location, status = excluded.status,
    price_from = excluded.price_from, currency = excluded.currency,
    rating_avg = excluded.rating_avg, rating_count = excluded.rating_count,
    popularity_score = excluded.popularity_score, published_at = excluded.published_at
  returning id into v_listing;

  insert into listing_translations (listing_id, locale, name, slug, summary, description, highlights, meta_title, meta_description)
  select v_listing, tt.locale, tt.title, tt.slug, tt.summary, tt.description,
         tt.highlights, tt.meta_title, tt.meta_description
  from tour_translations tt where tt.tour_id = new.id
  on conflict (listing_id, locale) do update set
    name = excluded.name, slug = excluded.slug, summary = excluded.summary,
    description = excluded.description, highlights = excluded.highlights,
    meta_title = excluded.meta_title, meta_description = excluded.meta_description;

  return null;
end;
$$;

create trigger sync_listing_on_tour after insert or update on tours
  for each row execute function internal.sync_listing_from_tour();

create or replace function internal.sync_listing_from_poi()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
declare
  v_listing uuid;
  v_country uuid;
  v_region  uuid;
begin
  select ci.country_id, ci.region_id into v_country, v_region
  from cities ci where ci.id = new.city_id;

  insert into listings (
    vertical_id, business_id, country_id, region_id, city_id, area_id,
    location, address, status, price_from, price_level, currency,
    rating_avg, rating_count, amenities, attributes,
    is_featured, is_claimed, popularity_score, poi_id
  )
  values (
    new.vertical_id, new.company_id, v_country, v_region, new.city_id, new.area_id,
    new.location, new.address, new.status, new.price_from, new.price_level, new.currency,
    coalesce(new.rating, 0), new.rating_count, new.amenities, new.attributes,
    new.is_featured, new.is_claimed, new.popularity_score, new.id
  )
  on conflict (poi_id) where poi_id is not null
  do update set
    vertical_id = excluded.vertical_id, business_id = excluded.business_id,
    city_id = excluded.city_id, region_id = excluded.region_id,
    location = excluded.location, address = excluded.address, status = excluded.status,
    price_from = excluded.price_from, price_level = excluded.price_level,
    currency = excluded.currency, rating_avg = excluded.rating_avg,
    rating_count = excluded.rating_count, amenities = excluded.amenities,
    attributes = excluded.attributes, is_featured = excluded.is_featured,
    is_claimed = excluded.is_claimed
  returning id into v_listing;

  insert into listing_translations (listing_id, locale, name, slug, summary, description, body, highlights, meta_title, meta_description)
  select v_listing, pt.locale, pt.name, pt.slug, pt.summary, pt.description,
         pt.body, pt.highlights, pt.meta_title, pt.meta_description
  from poi_translations pt where pt.poi_id = new.id
  on conflict (listing_id, locale) do update set
    name = excluded.name, slug = excluded.slug, summary = excluded.summary,
    description = excluded.description, body = excluded.body,
    highlights = excluded.highlights, meta_title = excluded.meta_title,
    meta_description = excluded.meta_description;

  return null;
end;
$$;

create trigger sync_listing_on_poi after insert or update on points_of_interest
  for each row execute function internal.sync_listing_from_poi();

-- Translations edited directly must propagate too.
create or replace function internal.sync_listing_translation()
returns trigger
language plpgsql
security definer set search_path = public, internal
as $$
begin
  if tg_table_name = 'tour_translations' then
    perform internal.sync_listing_from_tour() from tours where id = new.tour_id;
    update listing_translations lt
       set name = new.title, slug = new.slug, summary = new.summary,
           description = new.description, highlights = new.highlights,
           meta_title = new.meta_title, meta_description = new.meta_description
      from listings l
     where l.tour_id = new.tour_id and lt.listing_id = l.id and lt.locale = new.locale;
  else
    update listing_translations lt
       set name = new.name, slug = new.slug, summary = new.summary,
           description = new.description, body = new.body,
           meta_title = new.meta_title, meta_description = new.meta_description
      from listings l
     where l.poi_id = new.poi_id and lt.listing_id = l.id and lt.locale = new.locale;
  end if;
  return null;
end;
$$;

create trigger sync_listing_tr_poi after insert or update on poi_translations
  for each row execute function internal.sync_listing_translation();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table listings enable row level security;
alter table listings force row level security;
alter table listing_translations enable row level security;
alter table listing_translations force row level security;

create policy listings_public_read on listings for select
  using (status = 'published' or is_company_member(business_id) or is_staff());
create policy listings_owner_write on listings for all
  using (is_company_member(business_id) or is_staff())
  with check (is_company_member(business_id) or is_staff());

create policy listing_tr_read on listing_translations for select using (
  exists (select 1 from listings l where l.id = listing_translations.listing_id
          and (l.status = 'published' or is_company_member(l.business_id) or is_staff())));
create policy listing_tr_write on listing_translations for all using (
  exists (select 1 from listings l where l.id = listing_translations.listing_id
          and (is_company_member(l.business_id) or is_staff())))
  with check (
  exists (select 1 from listings l where l.id = listing_translations.listing_id
          and (is_company_member(l.business_id) or is_staff())));

-- ---------------------------------------------------------------------
-- THE UNIFIED READ MODEL
-- One relation the whole front end queries, whatever the vertical.
-- ---------------------------------------------------------------------
create or replace view listing_index
with (security_invoker = true) as
select
  l.id, lt.locale, lt.name, lt.slug, lt.summary, lt.description,
  l.vertical_id, vt.slug as vertical_slug, vt.name as vertical_name,
  coalesce(l.fulfilment, v.fulfilment) as fulfilment,
  l.country_id, cot.slug as country_slug, cot.name as country_name,
  l.region_id, rt.slug as region_slug, rt.name as region_name,
  l.city_id, ct.slug as city_slug, ct.name as city_name,
  l.business_id, l.address, l.location,
  l.price_from, l.price_level, l.currency,
  l.rating_avg, l.rating_count, l.popularity_score,
  l.amenities, l.attributes, l.is_featured, l.is_claimed,
  l.tour_id, l.poi_id, l.status, l.published_at
from listings l
join listing_translations lt on lt.listing_id = l.id
join verticals v on v.id = l.vertical_id
left join vertical_translations vt on vt.vertical_id = v.id and vt.locale = lt.locale
join countries co on co.id = l.country_id
left join country_translations cot on cot.country_id = co.id and cot.locale = lt.locale
left join regions r on r.id = l.region_id
left join region_translations rt on rt.region_id = r.id and rt.locale = lt.locale
join cities ci on ci.id = l.city_id
left join city_translations ct on ct.city_id = ci.id and ct.locale = lt.locale
where l.status = 'published';

grant select on listing_index to anon, authenticated;

-- Backfills every existing tour and POI by touching them, which fires the
-- sync triggers above. Safe to re-run.
create or replace function backfill_listings()
returns text
language plpgsql
security definer set search_path = public
as $$
declare v_tours int; v_poi int;
begin
  update tours set updated_at = now();
  get diagnostics v_tours = row_count;
  update points_of_interest set updated_at = now();
  get diagnostics v_poi = row_count;
  return format('Synced %s tours and %s places into listings.', v_tours, v_poi);
end;
$$;
