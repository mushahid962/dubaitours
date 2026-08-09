-- =====================================================================
-- 0021_locations.sql — PHASE 2: the global location system.
--
-- ONE TABLE, NOT SIX
--
-- Country, region, city, district, neighborhood and POI share the same
-- attributes: slug, coordinates, timezone, SEO title, meta description, H1,
-- intro, canonical, index flag, hero image, status, ordering. Six tables
-- would mean six admin screens, six translation tables and six copies of the
-- same SEO logic — and adding a seventh level later would mean doing it all
-- again.
--
-- So this is a single self-referencing table with a `level` enum and an ltree
-- path. Breadcrumbs, ancestor queries and "everything under Sharjah" become
-- one query each, at any depth.
--
-- The existing countries/regions/cities/areas tables stay: 30 foreign keys
-- point at them and the booking engine joins on them. They remain the
-- operational tables; `locations` is the canonical hierarchy and the page.
-- Triggers keep them in step.
-- =====================================================================

create type location_level as enum (
  'country', 'region', 'city', 'district', 'neighborhood', 'poi'
);

create table locations (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references locations(id) on delete restrict,
  level         location_level not null,
  -- Materialised ancestry: 'uae.dubai.marina'. One query for breadcrumbs,
  -- one for every descendant, at any depth.
  path          ltree not null,
  depth         smallint not null default 0,

  -- Identity
  country_code  char(2) not null,
  location_code text,                       -- 'AE-DU', IATA, municipality code
  timezone      text not null default 'Asia/Dubai',
  latitude      numeric(10,7),
  longitude     numeric(10,7),
  centroid      geography(point, 4326),
  bounds        geography(polygon, 4326),
  radius_m      integer,

  -- Presentation
  hero_media_id uuid references media_assets(id) on delete set null,
  hero_image_url text,
  status        content_status not null default 'draft',
  display_order smallint not null default 0,
  is_featured   boolean not null default false,

  -- Indexation. `is_indexable` is the admin's intent; `listing_count` is the
  -- fact. A page is only ever indexed when both agree — see should_index().
  is_indexable  boolean not null default true,
  listing_count integer not null default 0,
  child_count   integer not null default 0,

  -- Links back to the operational tables. Nullable because a neighborhood
  -- has no counterpart, and a POI is only in points_of_interest.
  country_id    uuid references countries(id) on delete cascade,
  region_id     uuid references regions(id) on delete cascade,
  city_id       uuid references cities(id) on delete cascade,
  area_id       uuid references areas(id) on delete cascade,
  poi_id        uuid references points_of_interest(id) on delete cascade,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint locations_root_has_no_parent
    check ((level = 'country') = (parent_id is null)),
  constraint locations_coords_together
    check (num_nonnulls(latitude, longitude) <> 1)
);

create unique index locations_path_uq on locations using btree (path);
create index locations_path_gist on locations using gist (path);
create index locations_parent_idx on locations (parent_id, display_order);
create index locations_level_idx on locations (level, country_code) where status = 'published';
create index locations_centroid_gix on locations using gist (centroid);
create unique index locations_country_uq on locations (country_id) where country_id is not null;
create unique index locations_region_uq  on locations (region_id)  where region_id  is not null;
create unique index locations_city_uq    on locations (city_id)    where city_id    is not null;
create unique index locations_area_uq    on locations (area_id)    where area_id    is not null;
create unique index locations_poi_uq     on locations (poi_id)     where poi_id     is not null;

-- ---------------------------------------------------------------------
-- TRANSLATIONS
-- Every SEO field lives here, once, for every level.
-- ---------------------------------------------------------------------
create table location_translations (
  location_id      uuid not null references locations(id) on delete cascade,
  locale           locale_code not null,
  name             text not null,
  slug             text not null,
  -- H1 is separate from name and from meta title on purpose: "Dubai" is the
  -- name, "Things to Do in Dubai" is the H1, and the title tag needs the year
  -- and a call to action. Collapsing them produces pages that read like a
  -- database dump.
  h1               text,
  tagline          text,
  intro            text,
  description      text,
  body             text,
  meta_title       text,
  meta_description text,
  canonical_url    text,
  robots           text not null default 'index,follow',
  og_title         text,
  og_description   text,
  primary key (location_id, locale)
);

-- Globally unique per locale, so /destinations/{slug} resolves without
-- knowing the level — which is what the requested URL shape needs.
create unique index location_slug_uq on location_translations (locale, slug);

create trigger touch_locations before update on locations
  for each row execute function internal.touch_updated_at();

-- ---------------------------------------------------------------------
-- HIERARCHY MAINTENANCE
-- ---------------------------------------------------------------------

/**
 * Keeps `path` and `depth` correct from the parent plus this row's slug.
 * ltree labels allow only [A-Za-z0-9_], so the slug is transliterated —
 * Arabic slugs stay in the translation table where they belong.
 */
create or replace function internal.location_path_label(p_location_id uuid)
returns text
language sql stable
as $$
  select coalesce(
    nullif(regexp_replace(lower(lt.slug), '[^a-z0-9]+', '_', 'g'), ''),
    replace(p_location_id::text, '-', '')
  )
  from location_translations lt
  where lt.location_id = p_location_id and lt.locale = 'en'
  limit 1;
$$;

create or replace function internal.rebuild_location_path(p_location_id uuid)
returns void
language plpgsql security definer set search_path = public, internal
as $$
declare
  v_parent_path ltree;
  v_label       text;
  v_new_path    ltree;
  r             record;
begin
  select l.path into v_parent_path
  from locations c join locations l on l.id = c.parent_id
  where c.id = p_location_id;

  v_label := internal.location_path_label(p_location_id);
  v_new_path := coalesce(v_parent_path, ''::ltree) ||
                (case when v_parent_path is null then v_label::ltree
                      else v_label::ltree end);

  update locations
     set path = v_new_path, depth = nlevel(v_new_path) - 1
   where id = p_location_id;

  -- Moving a branch must move everything under it, or the tree lies.
  for r in select id from locations where parent_id = p_location_id loop
    perform internal.rebuild_location_path(r.id);
  end loop;
end;
$$;

create or replace function internal.location_after_translation()
returns trigger
language plpgsql security definer set search_path = public, internal
as $$
begin
  if new.locale = 'en' then
    perform internal.rebuild_location_path(new.location_id);
  end if;
  return null;
end;
$$;

create trigger rebuild_path_on_translation
  after insert or update of slug on location_translations
  for each row execute function internal.location_after_translation();

/** Ancestors, root first — the breadcrumb trail in one query. */
create or replace function location_ancestors(p_location_id uuid, p_locale locale_code default 'en')
returns table (id uuid, level location_level, name text, slug text, depth smallint)
language sql stable
as $$
  select l.id, l.level, lt.name, lt.slug, l.depth
  from locations target
  join locations l on l.path @> target.path
  join location_translations lt on lt.location_id = l.id and lt.locale = p_locale
  where target.id = p_location_id
  order by l.depth;
$$;

/** Everything beneath a location, at any depth. */
create or replace function location_descendants(
  p_location_id uuid, p_level location_level default null, p_locale locale_code default 'en'
)
returns table (id uuid, level location_level, name text, slug text, listing_count integer)
language sql stable
as $$
  select l.id, l.level, lt.name, lt.slug, l.listing_count
  from locations root
  join locations l on l.path <@ root.path and l.id <> root.id
  join location_translations lt on lt.location_id = l.id and lt.locale = p_locale
  where root.id = p_location_id
    and (p_level is null or l.level = p_level)
    and l.status = 'published'
  order by l.display_order desc, l.listing_count desc, lt.name;
$$;

-- ---------------------------------------------------------------------
-- INDEXATION GATE
--
-- The brief: do not generate millions of pages; index only locations with
-- meaningful content. A location page earns indexation by having inventory
-- or by having been written. Everything else renders for a visitor who lands
-- on it, and carries noindex,follow — crawlable, not indexed.
-- ---------------------------------------------------------------------
create or replace function should_index_location(p_location_id uuid, p_locale locale_code default 'en')
returns boolean
language sql stable
as $$
  select
    l.status = 'published'
    and l.is_indexable
    and (
      -- Either it has enough inventory to answer the query…
      l.listing_count >= 3
      -- …or someone has actually written the page.
      or coalesce(length(lt.intro), 0) >= 250
      -- Countries and regions are hubs: they earn their place by linking to
      -- children, not by holding listings themselves.
      or (l.level in ('country','region') and l.child_count >= 1)
    )
  from locations l
  left join location_translations lt on lt.location_id = l.id and lt.locale = p_locale
  where l.id = p_location_id;
$$;

/** Recounts listings and children. Cheap enough to run nightly. */
create or replace function refresh_location_counts()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  -- A location's listing count includes everything beneath it, so a country
  -- shows the sum of its cities rather than zero.
  update locations l set listing_count = coalesce(c.total, 0)
  from (
    select anc.id, count(distinct li.id) as total
    from locations anc
    join locations descendant on descendant.path <@ anc.path
    join cities ci on ci.id = descendant.city_id
    join listings li on li.city_id = ci.id and li.status = 'published'
    group by anc.id
  ) c
  where c.id = l.id;

  update locations l set child_count = coalesce(k.total, 0)
  from (select parent_id, count(*) as total from locations
        where status = 'published' group by parent_id) k
  where k.parent_id = l.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table locations enable row level security;
alter table locations force row level security;
alter table location_translations enable row level security;
alter table location_translations force row level security;

create policy locations_public_read on locations for select
  using (status = 'published' or is_staff());
create policy locations_staff_write on locations for all
  using (has_permission('settings.write') or is_admin())
  with check (has_permission('settings.write') or is_admin());

create policy location_tr_read on location_translations for select using (
  exists (select 1 from locations l where l.id = location_translations.location_id
          and (l.status = 'published' or is_staff())));
create policy location_tr_write on location_translations for all
  using (has_permission('settings.write') or is_admin())
  with check (has_permission('settings.write') or is_admin());

-- ---------------------------------------------------------------------
-- READ MODEL
-- ---------------------------------------------------------------------
create or replace view location_pages
with (security_invoker = true) as
select
  l.id, lt.locale, l.level, l.path, l.depth, l.parent_id,
  lt.name, lt.slug, lt.h1, lt.tagline, lt.intro, lt.description, lt.body,
  lt.meta_title, lt.meta_description, lt.canonical_url, lt.robots,
  lt.og_title, lt.og_description,
  l.country_code, l.location_code, l.timezone, l.latitude, l.longitude,
  l.hero_image_url, l.status, l.display_order, l.is_featured,
  l.is_indexable, l.listing_count, l.child_count,
  l.country_id, l.region_id, l.city_id, l.area_id, l.poi_id,
  should_index_location(l.id, lt.locale) as should_index
from locations l
join location_translations lt on lt.location_id = l.id
where l.status = 'published';

grant select on location_pages to anon, authenticated;
