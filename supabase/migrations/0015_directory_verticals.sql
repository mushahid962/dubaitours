-- =====================================================================
-- 0015_directory_verticals.sql
--
-- Turns the site from a tours-only marketplace into a multi-vertical
-- directory: hotels, attractions, malls, things to do — plus tours.
--
-- THE MODELLING DECISION
--
-- A tour is bookable: it has departures, seats, per-pax pricing and a
-- cancellation policy. A mall has none of those. Adding hotels and malls to
-- `tours` would mean every query, every card and every page asking "does
-- this row actually sell anything?", and the booking engine would slowly
-- fill with null checks.
--
-- So `points_of_interest` is promoted from a thin "nearby" helper into a
-- full directory listing, and `tours` stays the bookable subtype. They share
-- geography, reviews, media and SEO; they differ where they genuinely differ.
--
-- A tour therefore appears in the directory through its own tables, and a
-- hotel appears through `points_of_interest`. Both are searchable by
-- destination and vertical; only one can take a seat reservation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VERTICALS — the top-level tabs on a destination page
-- ---------------------------------------------------------------------
create table verticals (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,      -- 'tours', 'hotels', 'attractions'
  -- Whether this vertical books through us or hands off to the operator.
  -- Tours transact; hotels and malls generate enquiries. Getting this wrong
  -- means promising a booking flow that does not exist.
  fulfilment   text not null default 'enquiry'
               check (fulfilment in ('booking', 'enquiry', 'affiliate', 'info_only')),
  icon         text,
  position     smallint not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table vertical_translations (
  vertical_id      uuid not null references verticals(id) on delete cascade,
  locale           locale_code not null,
  name             text not null,          -- "Hotels"
  slug             text not null,          -- "hotels"
  plural_label     text,                   -- "hotels in Dubai"
  intro            text,
  meta_title       text,
  meta_description text,
  primary key (vertical_id, locale)
);
create unique index vertical_slug_uq on vertical_translations (locale, slug);

-- ---------------------------------------------------------------------
-- 2. LISTINGS — points_of_interest, promoted
-- ---------------------------------------------------------------------
alter table points_of_interest
  add column if not exists vertical_id   uuid references verticals(id) on delete restrict,
  add column if not exists company_id    uuid references companies(id) on delete set null,
  add column if not exists status        listing_status not null default 'published',
  add column if not exists price_level   smallint check (price_level between 1 and 4),
  add column if not exists price_from    numeric(12,2),
  add column if not exists currency      currency_code,
  add column if not exists rating_count  integer not null default 0,
  add column if not exists phone         text,
  add column if not exists website       text,
  add column if not exists booking_url   text,
  add column if not exists opening_hours jsonb not null default '{}'::jsonb,
  -- Filter facets. jsonb keeps a hotel's "pool, spa, airport shuttle" and a
  -- mall's "cinema, food court" in one queryable shape without a column per
  -- vertical, and GIN makes containment queries fast.
  add column if not exists amenities     text[] not null default '{}',
  add column if not exists attributes    jsonb not null default '{}'::jsonb,
  add column if not exists is_featured   boolean not null default false,
  add column if not exists is_claimed    boolean not null default false,
  add column if not exists popularity_score numeric(10,4) not null default 0,
  add column if not exists updated_at    timestamptz not null default now();

alter table poi_translations
  add column if not exists description      text,
  add column if not exists body             text,
  add column if not exists highlights       text[] not null default '{}',
  add column if not exists meta_title       text,
  add column if not exists meta_description text;

create index if not exists poi_vertical_idx on points_of_interest (vertical_id, city_id)
  where is_active and status = 'published';
create index if not exists poi_amenities_gin on points_of_interest using gin (amenities);
create index if not exists poi_attributes_gin on points_of_interest using gin (attributes);
create index if not exists poi_price_idx on points_of_interest (city_id, price_from);
create index if not exists poi_rating_idx on points_of_interest (city_id, rating desc);

create trigger touch_poi before update on points_of_interest
  for each row execute function internal.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. ENQUIRIES
-- Verticals that do not transact still capture demand. The requirements a
-- traveller types here are the whole product for lead-gen verticals, so they
-- are structured rather than dumped into a free-text blob.
-- ---------------------------------------------------------------------
alter table leads
  add column if not exists listing_id   uuid references points_of_interest(id) on delete set null,
  add column if not exists vertical_id  uuid references verticals(id) on delete set null,
  add column if not exists requirements jsonb not null default '{}'::jsonb,
  add column if not exists preferred_contact text
    check (preferred_contact in ('email', 'phone', 'whatsapp'));

create index if not exists leads_listing_idx on leads (listing_id) where listing_id is not null;

-- ---------------------------------------------------------------------
-- 4. DIRECTORY SEARCH VIEW
-- One flat row per (listing, locale), mirroring tour_search_index so the
-- listing page can query either with the same shape.
-- ---------------------------------------------------------------------
create or replace view directory_listings
with (security_invoker = true) as
select
  p.id,
  pt.locale,
  pt.name,
  pt.slug,
  pt.summary,
  pt.description,
  p.kind,
  p.vertical_id,
  vt.slug            as vertical_slug,
  vt.name            as vertical_name,
  p.city_id,
  ct.name            as city_name,
  ct.slug            as city_slug,
  c.id               as country_id,
  cot.name           as country_name,
  cot.slug           as country_slug,
  p.address,
  p.location,
  p.rating,
  p.rating_count,
  p.price_level,
  p.price_from,
  p.currency,
  p.amenities,
  p.attributes,
  p.image_url,
  p.phone,
  p.website,
  p.booking_url,
  p.opening_hours,
  p.is_featured,
  p.is_claimed,
  p.popularity_score,
  p.company_id
from points_of_interest p
join poi_translations pt on pt.poi_id = p.id
join cities ci on ci.id = p.city_id
join city_translations ct on ct.city_id = ci.id and ct.locale = pt.locale
join countries c on c.id = ci.country_id
join country_translations cot on cot.country_id = c.id and cot.locale = pt.locale
left join verticals v on v.id = p.vertical_id
left join vertical_translations vt on vt.vertical_id = v.id and vt.locale = pt.locale
where p.is_active and p.status = 'published';

grant select on directory_listings to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. FACET COUNTS
-- Filter sidebars need "Pool (42)". Counting in the app means pulling every
-- row; this does it in the database and returns only the counts.
-- ---------------------------------------------------------------------
create or replace function directory_facets(
  p_city_id     uuid,
  p_vertical_id uuid default null,
  p_locale      locale_code default 'en'
)
returns table (facet text, value text, count bigint)
language sql
stable
as $$
  with scope as (
    select p.* from points_of_interest p
    where p.city_id = p_city_id
      and p.is_active and p.status = 'published'
      and (p_vertical_id is null or p.vertical_id = p_vertical_id)
  )
  select 'amenity'::text, a.amenity, count(*)
  from scope, unnest(scope.amenities) as a(amenity)
  group by a.amenity
  union all
  select 'price_level'::text, price_level::text, count(*)
  from scope where price_level is not null
  group by price_level
  union all
  select 'rating'::text,
         case when rating >= 4.5 then '4.5' when rating >= 4 then '4.0'
              when rating >= 3.5 then '3.5' else 'any' end,
         count(*)
  from scope where rating is not null
  group by 1, 2
  order by 1, 3 desc;
$$;

-- ---------------------------------------------------------------------
-- 6. SEED THE VERTICALS
-- ---------------------------------------------------------------------
insert into verticals (code, fulfilment, icon, position) values
  ('tours',        'booking', 'compass',  0),
  ('things-to-do', 'booking', 'sparkles', 1),
  ('attractions',  'enquiry', 'landmark', 2),
  ('hotels',       'enquiry', 'bed',      3),
  ('malls',        'info_only', 'shopping-bag', 4),
  ('restaurants',  'info_only', 'utensils', 5)
on conflict (code) do nothing;

insert into vertical_translations (vertical_id, locale, name, slug, plural_label, intro, meta_title, meta_description)
select v.id, x.locale::locale_code, x.name, x.slug, x.plural, x.intro, x.meta_title, x.meta_desc
from verticals v
join (values
  ('tours','en','Tours','tours','tours','Guided tours and day trips, bookable with instant confirmation.',
   'Tours in %s | Book Online','Book guided tours and day trips in %s. Verified operators, free cancellation.'),
  ('tours','ar','جولات','جولات','جولات','جولات سياحية ورحلات يومية بتأكيد فوري.',
   'جولات في %s | احجز الآن','احجز جولات ورحلات يومية في %s. مشغلون معتمدون وإلغاء مجاني.'),
  ('things-to-do','en','Things to do','things-to-do','experiences','Everything worth doing, from desert safaris to water parks.',
   'Things to Do in %s | Tickets & Tours','Find things to do in %s — attractions, tours and experiences with instant confirmation.'),
  ('attractions','en','Attractions','attractions','attractions','Landmarks, museums and the sights worth planning a day around.',
   'Attractions in %s | Tickets & Opening Hours','Top attractions in %s with opening hours, prices and how to get there.'),
  ('hotels','en','Hotels','hotels','hotels','Where to stay, from beach resorts to city apartments.',
   'Hotels in %s | Where to Stay','Find hotels in %s by area, price and amenities.'),
  ('malls','en','Malls','malls','malls','Shopping centres, outlets and souqs.',
   'Malls in %s | Shopping Guide','Shopping malls and souqs in %s with opening hours and what is inside.'),
  ('restaurants','en','Restaurants','restaurants','restaurants','Where to eat, by cuisine and neighbourhood.',
   'Restaurants in %s | Where to Eat','Restaurants in %s by cuisine, price and area.')
) as x(code, locale, name, slug, plural, intro, meta_title, meta_desc) on x.code = v.code
on conflict do nothing;

-- Existing POI rows predate verticals; map them by their `kind`.
update points_of_interest p
   set vertical_id = v.id
  from verticals v
 where p.vertical_id is null
   and v.code = case p.kind
     when 'hotel' then 'hotels'
     when 'mall' then 'malls'
     when 'restaurant' then 'restaurants'
     else 'attractions'
   end;
